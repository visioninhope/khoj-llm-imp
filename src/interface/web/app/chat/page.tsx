"use client";

import styles from "./chat.module.css";
import React, { Suspense, useEffect, useRef, useState } from "react";

import SidePanel, { ChatSessionActionMenu } from "../components/sidePanel/chatHistorySidePanel";
import ChatHistory from "../components/chatHistory/chatHistory";
import { useSearchParams } from "next/navigation";
import Loading from "../components/loading/loading";

import { processMessageChunk } from "../common/chatFunctions";

import "katex/dist/katex.min.css";

import {
    CodeContext,
    Context,
    OnlineContext,
    StreamMessage,
} from "../components/chatMessage/chatMessage";
import { useIPLocationData, useIsMobileWidth, welcomeConsole } from "../common/utils";
import { ChatInputArea, ChatOptions } from "../components/chatInputArea/chatInputArea";
import { useAuthenticatedData } from "../common/auth";
import { AgentData } from "../agents/page";

interface ChatBodyDataProps {
    chatOptionsData: ChatOptions | null;
    setTitle: (title: string) => void;
    onConversationIdChange?: (conversationId: string) => void;
    setQueryToProcess: (query: string) => void;
    streamedMessages: StreamMessage[];
    setStreamedMessages: (messages: StreamMessage[]) => void;
    setUploadedFiles: (files: string[]) => void;
    isMobileWidth?: boolean;
    isLoggedIn: boolean;
    setImages: (images: string[]) => void;
}

function ChatBodyData(props: ChatBodyDataProps) {
    const searchParams = useSearchParams();
    const conversationId = searchParams.get("conversationId");
    const [message, setMessage] = useState("");
    const [images, setImages] = useState<string[]>([]);
    const [processingMessage, setProcessingMessage] = useState(false);
    const [agentMetadata, setAgentMetadata] = useState<AgentData | null>(null);
    const [isInResearchMode, setIsInResearchMode] = useState(false);
    const chatInputRef = useRef<HTMLTextAreaElement>(null);

    const setQueryToProcess = props.setQueryToProcess;
    const onConversationIdChange = props.onConversationIdChange;

    const chatHistoryCustomClassName = props.isMobileWidth ? "w-full" : "w-4/6";

    useEffect(() => {
        if (images.length > 0) {
            const encodedImages = images.map((image) => encodeURIComponent(image));
            props.setImages(encodedImages);
        }
    }, [images, props.setImages]);

    useEffect(() => {
        const storedImages = localStorage.getItem("images");
        if (storedImages) {
            const parsedImages: string[] = JSON.parse(storedImages);
            setImages(parsedImages);
            const encodedImages = parsedImages.map((img: string) => encodeURIComponent(img));
            props.setImages(encodedImages);
            localStorage.removeItem("images");
        }

        const storedMessage = localStorage.getItem("message");
        if (storedMessage) {
            setProcessingMessage(true);
            setQueryToProcess(storedMessage);

            if (storedMessage.trim().startsWith("/research")) {
                setIsInResearchMode(true);
            }
        }
    }, [setQueryToProcess, props.setImages]);

    useEffect(() => {
        if (message) {
            setProcessingMessage(true);
            setQueryToProcess(message);
        }
    }, [message, setQueryToProcess]);

    useEffect(() => {
        if (conversationId) {
            onConversationIdChange?.(conversationId);
        }
    }, [conversationId, onConversationIdChange]);

    useEffect(() => {
        if (
            props.streamedMessages &&
            props.streamedMessages.length > 0 &&
            props.streamedMessages[props.streamedMessages.length - 1].completed
        ) {
            setProcessingMessage(false);
            setImages([]); // Reset images after processing
        } else {
            setMessage("");
        }
    }, [props.streamedMessages]);

    if (!conversationId) {
        window.location.href = "/";
        return;
    }

    return (
        <>
            <div className={false ? styles.chatBody : styles.chatBodyFull}>
                <ChatHistory
                    conversationId={conversationId}
                    setTitle={props.setTitle}
                    setAgent={setAgentMetadata}
                    pendingMessage={processingMessage ? message : ""}
                    incomingMessages={props.streamedMessages}
                    setIncomingMessages={props.setStreamedMessages}
                    customClassName={chatHistoryCustomClassName}
                />
            </div>
            <div
                className={`${styles.inputBox} p-1 md:px-2 shadow-md bg-background align-middle items-center justify-center dark:bg-neutral-700 dark:border-0 dark:shadow-sm rounded-t-2xl rounded-b-none md:rounded-xl h-fit ${chatHistoryCustomClassName} mr-auto ml-auto`}
            >
                <ChatInputArea
                    agentColor={agentMetadata?.color}
                    isLoggedIn={props.isLoggedIn}
                    sendMessage={(message) => setMessage(message)}
                    sendImage={(image) => setImages((prevImages) => [...prevImages, image])}
                    sendDisabled={processingMessage}
                    chatOptionsData={props.chatOptionsData}
                    conversationId={conversationId}
                    isMobileWidth={props.isMobileWidth}
                    setUploadedFiles={props.setUploadedFiles}
                    ref={chatInputRef}
                    isResearchModeEnabled={isInResearchMode}
                />
            </div>
        </>
    );
}

export default function Chat() {
    const defaultTitle = "Khoj AI - Chat";
    const [chatOptionsData, setChatOptionsData] = useState<ChatOptions | null>(null);
    const [isLoading, setLoading] = useState(true);
    const [title, setTitle] = useState(defaultTitle);
    const [conversationId, setConversationID] = useState<string | null>(null);
    const [messages, setMessages] = useState<StreamMessage[]>([]);
    const [queryToProcess, setQueryToProcess] = useState<string>("");
    const [processQuerySignal, setProcessQuerySignal] = useState(false);
    const [uploadedFiles, setUploadedFiles] = useState<string[]>([]);
    const [images, setImages] = useState<string[]>([]);

    const locationData = useIPLocationData() || {
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
    const authenticatedData = useAuthenticatedData();
    const isMobileWidth = useIsMobileWidth();

    useEffect(() => {
        fetch("/api/chat/options")
            .then((response) => response.json())
            .then((data: ChatOptions) => {
                setLoading(false);
                // Render chat options, if any
                if (data) {
                    setChatOptionsData(data);
                }
            })
            .catch((err) => {
                console.error(err);
                return;
            });

        welcomeConsole();
    }, []);

    useEffect(() => {
        if (queryToProcess) {
            const newStreamMessage: StreamMessage = {
                rawResponse: "",
                trainOfThought: [],
                context: [],
                onlineContext: {},
                codeContext: {},
                completed: false,
                timestamp: new Date().toISOString(),
                rawQuery: queryToProcess || "",
                images: images,
            };
            setMessages((prevMessages) => [...prevMessages, newStreamMessage]);
            setProcessQuerySignal(true);
        }
    }, [queryToProcess]);

    useEffect(() => {
        if (processQuerySignal) {
            chat();
        }
    }, [processQuerySignal]);

    async function readChatStream(response: Response) {
        if (!response.ok) throw new Error(response.statusText);
        if (!response.body) throw new Error("Response body is null");

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        const eventDelimiter = "␃🔚␗";
        let buffer = "";

        // Track context used for chat response
        let context: Context[] = [];
        let onlineContext: OnlineContext = {};
        let codeContext: CodeContext = {};

        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                setQueryToProcess("");
                setProcessQuerySignal(false);
                setImages([]);
                break;
            }

            const chunk = decoder.decode(value, { stream: true });
            buffer += chunk;

            let newEventIndex;
            while ((newEventIndex = buffer.indexOf(eventDelimiter)) !== -1) {
                const event = buffer.slice(0, newEventIndex);
                buffer = buffer.slice(newEventIndex + eventDelimiter.length);
                if (event) {
                    const currentMessage = messages.find((message) => !message.completed);

                    if (!currentMessage) {
                        console.error("No current message found");
                        return;
                    }

                    // Track context used for chat response. References are rendered at the end of the chat
                    ({ context, onlineContext, codeContext } = processMessageChunk(
                        event,
                        currentMessage,
                        context,
                        onlineContext,
                        codeContext,
                    ));

                    setMessages([...messages]);
                }
            }
        }
    }

    async function chat() {
        localStorage.removeItem("message");
        if (!queryToProcess || !conversationId) return;
        const chatAPI = "/api/chat?client=web";
        const chatAPIBody = {
            q: queryToProcess,
            conversation_id: conversationId,
            stream: true,
            ...(locationData && {
                city: locationData.city,
                region: locationData.region,
                country: locationData.country,
                country_code: locationData.countryCode,
                timezone: locationData.timezone,
            }),
            ...(images.length > 0 && { images: images }),
        };

        const response = await fetch(chatAPI, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(chatAPIBody),
        });

        try {
            await readChatStream(response);
        } catch (err) {
            const apiError = await response.json();
            console.error(apiError);
            // Retrieve latest message being processed
            const currentMessage = messages.find((message) => !message.completed);
            if (!currentMessage) return;

            // Render error message as current message
            const errorMessage = (err as Error).message;
            if (errorMessage.includes("Error in input stream"))
                currentMessage.rawResponse = `Woops! The connection broke while I was writing my thoughts down. Maybe try again in a bit or dislike this message if the issue persists?`;
            else if (response.status === 429) {
                "detail" in apiError
                    ? (currentMessage.rawResponse = `${apiError.detail}`)
                    : (currentMessage.rawResponse = `I'm a bit overwhelmed at the moment. Could you try again in a bit or dislike this message if the issue persists?`);
            } else
                currentMessage.rawResponse = `Umm, not sure what just happened. I see this error message: ${errorMessage}. Could you try again or dislike this message if the issue persists?`;

            // Complete message streaming teardown properly
            currentMessage.completed = true;
            setMessages([...messages]);
            setQueryToProcess("");
            setProcessQuerySignal(false);
        }
    }

    const handleConversationIdChange = (newConversationId: string) => {
        setConversationID(newConversationId);
    };

    if (isLoading) return <Loading />;

    return (
        <div className={`${styles.main} ${styles.chatLayout}`}>
            <title>
                {`${defaultTitle}${!!title && title !== defaultTitle ? `: ${title}` : ""}`}
            </title>
            <div>
                <SidePanel
                    conversationId={conversationId}
                    uploadedFiles={uploadedFiles}
                    isMobileWidth={isMobileWidth}
                />
            </div>
            <div className={styles.chatBox}>
                <div className={styles.chatBoxBody}>
                    {!isMobileWidth && conversationId && (
                        <div
                            className={`${styles.chatTitleWrapper} text-nowrap text-ellipsis overflow-hidden max-w-screen-md grid items-top font-bold mr-8 pt-6 col-auto h-fit`}
                        >
                            {title && (
                                <h2
                                    className={`text-lg text-ellipsis whitespace-nowrap overflow-x-hidden`}
                                >
                                    {title}
                                </h2>
                            )}
                            <ChatSessionActionMenu
                                conversationId={conversationId}
                                setTitle={setTitle}
                                sizing="md"
                            />
                        </div>
                    )}
                    <Suspense fallback={<Loading />}>
                        <ChatBodyData
                            isLoggedIn={authenticatedData !== null}
                            streamedMessages={messages}
                            setStreamedMessages={setMessages}
                            chatOptionsData={chatOptionsData}
                            setTitle={setTitle}
                            setQueryToProcess={setQueryToProcess}
                            setUploadedFiles={setUploadedFiles}
                            isMobileWidth={isMobileWidth}
                            onConversationIdChange={handleConversationIdChange}
                            setImages={setImages}
                        />
                    </Suspense>
                </div>
            </div>
        </div>
    );
}
