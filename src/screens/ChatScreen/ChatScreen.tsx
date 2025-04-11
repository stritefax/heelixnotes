import { type FC, useState, useEffect, useRef, useMemo, Fragment } from "react";
import { type } from "@tauri-apps/api/os";
import {
  Flex,
  Spinner,
  useDisclosure,
  Box,
  IconButton,
  Tooltip,
  Wrap,
  WrapItem,
  useToast,
} from "@chakra-ui/react";
import { Text, NavButton } from "@heelix-app/design";
import styled from "styled-components";
import { invoke } from "@tauri-apps/api/tauri";
import { listen } from "@tauri-apps/api/event";
import type { StoredMessage, Chat } from "./types";
import { debounce } from "lodash";
import { FileText, X, History, Folder, MessageCircle } from "lucide-react";
import { ScreenContainer } from "@/components/layout";


import {
  UserMessage,
  AssistantMessage,
  ChatHeader,
  ChatInput,
  ChatHistoryList,
  SettingsModal,
  SelectDocumentModal,
  NewConversationMessage,
  TipTapEditor,
} from "./components";
import { useGlobalSettings } from "../../Providers/SettingsProvider";
import { DocumentFootnote } from "./components";
import { SidePanel } from "../../components/SidePanel";
import { Projects } from "../../features";
import { useProject } from "../../state";

const ChatContainer = styled.div`
  display: flex;
  grid-area: content;
  align-items: center;
  flex-direction: column;
  width: 100%;
  height: 100%;
  overflow-y: auto;
  background-color: white;
  
  [data-theme="dark"] & {
    background-color: var(--page-background-color);
  }
`;

const MessagesScrollContainer = styled.div`
  display: flex;
  flex: 1;
  width: 100%;
  justify-content: center;
  overflow-y: auto;
  &::-webkit-scrollbar {
    width: 8px;
  }
`;

const MessagesContainer = styled.div`
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: var(--breakpoint-medium);
  flex: 1;
  padding: var(--space-l) var(--space-l) 0 var(--space-l);
  gap: var(--space-xl);
  overflow-anchor: none;
`;

const ActivityTextContainer = styled.div`
  display: flex;
  flex: 1;
  width: 100%;
  justify-content: center; /* Center the content */
  overflow-y: auto;
  &::-webkit-scrollbar {
    width: 8px;
  }
`;

const ActivityIcon = styled.div`
  width: 40px;
  height: 50px;
  background-color: #f0f0f0;
  border: 1px solid #e0e0e0;
  border-radius: 4px;
  display: flex;
  justify-content: center;
  align-items: center;
  position: relative;
`;

const ActivityPreview = styled.div`
  width: 220px;
  height: 50px;
  background-color: white;
  border: 1px solid #e0e0e0;
  border-radius: 4px;
  padding: 8px 10px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  justify-content: center;
`;

const DocName = styled.div`
  font-size: 12px;
  font-weight: 500;
  color: var(--chakra-colors-gray-700);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const ProjectName = styled.div`
  font-size: 11px;
  color: var(--chakra-colors-gray-500);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

interface SelectedActivity {
  id: number;
  text: string;
  name?: string;
  projectName?: string;
}

export const ChatScreen: FC = () => {
  const [userInput, setUserInput] = useState("");
  const toast = useToast();
  const [chats, setChats] = useState<Chat[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<number>();
  const [dialogue, setDialogue] = useState<StoredMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [firstTokenReceived, setFirstTokenReceived] = useState(false);
  const [isChatHistoryOpen, setIsChatHistoryOpen] = useState(false);
  const messageRef = useRef<HTMLDivElement | null>(null);
  const messageContainerRef = useRef<HTMLDivElement | null>(null);
  const [isFirstMessage, setIsFirstMessage] = useState(true);
  const [windowTitles, setWindowTitles] = useState<string[]>([]);
  const [isLoadingExistingChat, setIsLoadingExistingChat] = useState(false);
  const [dailyOutputTokens, setDailyOutputTokens] = useState(0);
  const [lastResetTimestamp, setLastResetTimestamp] = useState("");
  const [isActivityHistoryOpen, setIsActivityHistoryOpen] = useState(false);
  const [selectedActivityTexts, setSelectedActivityTexts] = useState<Array<{
    text: string,
    name: string,
    projectName?: string
  }>>([]);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [selectedActivityName, setSelectedActivityName] = useState("");
  const [currentModelId, setCurrentModelId] = useState<string>("");
  const [isEditing, setIsEditing] = useState(false);
  
  const { 
    state,
    getSelectedProject, 
    getSelectedProjectActivityText,
    fetchSelectedActivityText,
    selectProject,
    selectActivity,
    updateActivityName,
    getActivityName
  } = useProject();
  const [selectedActivityText, setSelectedActivityText] = useState("");
  const [isLoadingActivityText, setIsLoadingActivityText] = useState(false);

  const {
    isOpen: isSettingsOpen,
    onOpen: onSettingsOpen,
    onClose: onSettingsClose,
  } = useDisclosure();
  
  const [activeSettingsCategory, setActiveSettingsCategory] = useState("general");
  const { settings } = useGlobalSettings();

  const debouncedScroll = useMemo(
    () =>
      debounce((ref: HTMLDivElement) => {
        if (scrollTimeoutRef.current) {
          clearTimeout(scrollTimeoutRef.current);
        }
        scrollTimeoutRef.current = setTimeout(() => {
          ref.scrollTo({
            top: ref.scrollHeight,
            behavior: "smooth",
          });
        }, 100);
      }, 100),
    []
  );

  useEffect(() => {
    fetchChats();
    setDialogue([]);

    const unlisten1 = listen("llm_response", (event: any) => {
      // Handle the llm_response event
      // ...
    });

    const unlisten2 = listen("output_tokens", (event: any) => {
      setDailyOutputTokens((prevTokens) => {
        const updatedTokens = prevTokens + event.payload;
        saveTokenData(updatedTokens);
        return updatedTokens;
      });
    });

    const unlisten3 = listen("window_titles", (event: any) => {
      const windowTitles = JSON.parse(event.payload);
      setWindowTitles(windowTitles);
    });

    retrieveTokenData();
    resetDailyOutputTokens();

    return () => {
      unlisten1.then((f) => f());
      unlisten2.then((f) => f());
      unlisten3.then((f) => f());
    };
  }, []);
  
  useEffect(() => {
    if (state.selectedActivityId) {
      setIsLoadingActivityText(true);
      fetchSelectedActivityText()
        .then((text) => {
          setSelectedActivityText(text);
          
          // Use the existing getActivityName function with null check
          // This already searches across all projects including unassigned
          if (state.selectedActivityId !== null) {
            const activityName = getActivityName(state.selectedActivityId);
            setSelectedActivityName(activityName);
          }
        })
        .finally(() => {
          setIsLoadingActivityText(false);
        });
    } else {
      setSelectedActivityText("");
      setSelectedActivityName("");
    }
  }, [state.selectedActivityId, state.projects]);

  const fetchChats = async () => {
    try {
      messageRef.current = null;
      const allChats = await invoke<Chat[]>("get_all_chats");
      setChats(allChats);
      if (selectedChatId && !allChats.some((chat) => chat.id === selectedChatId)) {
        setSelectedChatId(undefined);
        setDialogue([]);
      }
    } catch (error) {
      console.error("Error fetching chats:", error);
    }
  };

  const fetchMessages = async (chatId: number) => {
    try {
      setIsLoadingExistingChat(true);
      const messages = await invoke<StoredMessage[]>("get_messages_by_chat_id", { chatId });
      setDialogue(messages);
      setIsFirstMessage(messages.length === 0);
    } catch (error) {
      console.error("Error fetching messages:", error);
    } finally {
      setIsLoadingExistingChat(false);
    }
  };

  const handleEditText = () => {
    setIsEditing(true);
  };

  const handleSaveText = async (newContent: string, newTitle: string) => {
    if (state.selectedActivityId) {
      // Save content
      await invoke<void>('update_project_activity_text', {
        activityId: state.selectedActivityId,
        text: newContent,
      });
      
      // Save title if changed
      if (newTitle !== selectedActivityName) {
        await updateActivityName(state.selectedActivityId, newTitle);
      }
      
      await fetchSelectedActivityText();
      setIsEditing(false);
    }
  };

  const handleActivitySelect = (selectedActivities: SelectedActivity[]) => {
    const newDocs = selectedActivities.map((activity) => ({
      text: activity.text,
      name: activity.name || `Document ${activity.id}`,
      projectName: activity.projectName
    }));
    setSelectedActivityTexts((prevDocs) => [...prevDocs, ...newDocs]);
    setIsActivityHistoryOpen(false);
  };

  const handleRemoveActivity = (index: number) => {
    setSelectedActivityTexts((prevDocs) => 
      prevDocs.filter((_, i) => i !== index)
    );
  };

  useEffect(() => {
    // Set default model based on provider preference
    const defaultModel = settings.api_choice === "claude" 
      ? "claude-3-7-sonnet-20250219" // Default Claude model is 3.7 Sonnet
      : "gpt-4o";                    // Default OpenAI model is GPT-4o
    
    setCurrentModelId(defaultModel);
  }, [settings.api_choice]);
  
  useEffect(() => {
    if (selectedChatId) {
      setDialogue([]);
      fetchMessages(selectedChatId);
      selectActivity(null);
    } else {
      setDialogue([]);
      selectActivity(null);
    }
  }, [selectedChatId]);

  const generateName = async (chatId: number, userInput: string) => {
    try {
      const name = settings.api_choice === "openai"
        ? await invoke<string>("generate_conversation_name", { userInput })
        : await invoke<string>("name_conversation", { userInput });
      await invoke<boolean>("update_chat_name", { chatId, name });
      setChats((prevChats) =>
        prevChats.map((chat) => (chat.id === chatId ? { ...chat, name } : chat))
      );
    } catch (error) {
      console.error("Error generating conversation name:", error);
      setChats((prevChats) =>
        prevChats.map((chat) =>
          chat.id === chatId ? { ...chat, name: "Unnamed Chat" } : chat
        )
      );
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setUserInput(e.target.value);
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const getChatId = async (): Promise<number> => {
    if (selectedChatId) {
      return selectedChatId;
    }
    try {
      const chatId = await invoke<number>("create_chat", { name: "New Chat" });
      const currentTime = new Date().toISOString();
      generateName(chatId, userInput);
      setChats([
        {
          id: chatId,
          name: "New Chat",
          created_at: currentTime,
          updated_at: currentTime,
        },
        ...chats,
      ]);
      return chatId;
    } catch (error) {
      console.error("Error creating new chat:", error);
      throw new Error("Error creating new chat");
    }
  };

  const sendPromptToLlm = async (chatId: number, isFirstMessage: boolean, modelId?: string) => {
    try {
      const currentDate = new Date();
      const lastResetDate = new Date(lastResetTimestamp);

      if (
        currentDate.getDate() !== lastResetDate.getDate() ||
        currentDate.getMonth() !== lastResetDate.getMonth() ||
        currentDate.getFullYear() !== lastResetDate.getFullYear()
      ) {
        setDailyOutputTokens(0);
        setLastResetTimestamp(currentDate.toISOString());
        saveTokenData(0);
      }

      const conversationHistory = dialogue.map((message) => ({
        role: message.role,
        content: message.content,
      }));

      const userMessage = {
        role: "user",
        content: userInput,
      };

      const fullConversation = [...conversationHistory, userMessage];

      console.log("Sending conversation history to LLM:", fullConversation);

      const estimatedTokens = 1000; // Adjust this value based on your estimation
      if (dailyOutputTokens + estimatedTokens > 130000000) {
        setDialogue((prevDialogue) => [
          ...prevDialogue,
          {
            id: Date.now(),
            chat_id: chatId,
            role: "assistant",
            content: "You have reached your daily token limit. The limit resets at 12am.",
            created_at: new Date().toISOString(),
          },
        ]);
        setIsLoading(false);
        setIsGenerating(false);
        return;
      }

      const isClaudeModel = modelId ? modelId.includes("claude") : settings.api_choice === "claude";
    
      // Get combined text from selected documents with document names and project names
      const formattedDocTexts = selectedActivityTexts.map(
        doc => `Document "${doc.name}" from ${doc.projectName ? `project "${doc.projectName}"` : "unassigned"}: ${doc.text}`
      ).join("\n\n");
      
      // Get the combined activity text and check if it's empty
      const selectedProjectText = await getSelectedProjectActivityText();
      const combinedActivityText = selectedProjectText + "\n" + formattedDocTexts;
      
      // Override isFirstMessage if there's any activity text or if local indexing is disabled
      const hasActivityText = combinedActivityText.trim() !== "";
      const isLocalIndexingDisabled = !settings.vectorization_enabled;
      const effectiveIsFirstMessage = hasActivityText || isLocalIndexingDisabled ? false : isFirstMessage;

      // Use the formatted document texts in the API calls
      if (!isClaudeModel) {
        await invoke("send_prompt_to_openai", {
          conversationHistory: fullConversation,
          isFirstMessage: effectiveIsFirstMessage,
          combinedActivityText,
          modelId: modelId // Pass the model ID to the backend
        });
      } else {
        await invoke("send_prompt_to_llm", {
          conversationHistory: fullConversation,
          isFirstMessage: effectiveIsFirstMessage,
          combinedActivityText,
          modelId: modelId // Pass the model ID to the backend
        });
      }

      await invoke("create_message", {
        chatId,
        role: "user",
        content: userInput,
      });

      setSelectedActivityTexts([]);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred";
      console.error("Error from Claude API:", errorMessage);
      setDialogue((prevDialogue) => [
        ...prevDialogue,
        {
          id: Date.now(),
          chat_id: chatId,
          role: "assistant",
          content: errorMessage,
          created_at: new Date().toISOString(),
        },
      ]);
    }
  };

  const handleSubmit = async (modelId?: string) => {
    const selectedModelId = modelId || currentModelId;
    
    // Check if the selected model is Claude or OpenAI based on model ID
    const isClaudeModel = selectedModelId.includes("claude");
    
    // For OpenAI models, we need the OpenAI key
    if (!isClaudeModel && !settings.api_key_open_ai) {
      toast({
        title: "API key not provided",
        description: "Please provide the OpenAI API key in Settings > General to continue",
        status: "error",
        duration: 9000,
        isClosable: true,
      });
      onSettingsOpen();
      return;
    }
    
    // For Claude models, we only need the Claude key
    if (isClaudeModel && !settings.api_key_claude) {
      toast({
        title: "API key not provided",
        description: "Please provide the Claude API key in Settings > General to continue",
        status: "error",
        duration: 9000,
        isClosable: true,
      });
      onSettingsOpen();
      return;
    }
    
    if (selectedActivityText) {
      selectActivity(null);
      setSelectedActivityText("");
    }
    
    setIsLoading(true);
    setIsGenerating(true);
    setFirstTokenReceived(false);

    try {
      let chatId: number;
      if (dialogue.length > 0) {
        chatId = dialogue[dialogue.length - 1].chat_id;
      } else {
        chatId = await getChatId();
      }
      setDialogue((prevDialogue) => [
        ...prevDialogue,
        {
          id: Date.now(),
          chat_id: chatId,
          role: "user",
          content: userInput,
          created_at: new Date().toISOString(),
        },
      ]);
      setUserInput("");
      setWindowTitles([]);

      let assistantMessage = "";

      const unlisten = await listen("llm_response", (event: any) => {
        console.log("Received llm_response event:", event);

        assistantMessage = event.payload as string;

        if (!firstTokenReceived) {
          setFirstTokenReceived(true);
        }

        setDialogue((prevDialogue) => {
          const lastMessage = prevDialogue[prevDialogue.length - 1];
          if (lastMessage && lastMessage.role === "assistant") {
            return prevDialogue.map((message, index) =>
              index === prevDialogue.length - 1
                ? { ...message, content: assistantMessage }
                : message
            );
          } else {
            const newMessage = {
              id: Date.now(),
              chat_id: chatId,
              role: "assistant" as const,
              content: assistantMessage,
              created_at: new Date().toISOString(),
            };
            return [...prevDialogue, newMessage];
          }
        });
      });

      await sendPromptToLlm(chatId, isFirstMessage, selectedModelId);
      setIsFirstMessage(false);

      unlisten();
      setUserInput("");
      setIsLoading(false);
      setIsGenerating(false);
      await invoke("create_message", {
        chatId,
        role: "assistant",
        content: assistantMessage,
      });
    } catch (error) {
      console.error("ChatScreen: handleSubmit has failed");
      return;
    }
  };

  const handleChatHistoryToggle = () => {
    setIsChatHistoryOpen(!isChatHistoryOpen);
  };

  const handleActivityHistoryToggle = () => {
    setIsActivityHistoryOpen(!isActivityHistoryOpen);
  };

  const handleDeleteChat = async (chatId: number) => {
    try {
      await invoke("delete_chat", { chatId });
      setChats(chats.filter((chat) => chat.id !== chatId));
      if (selectedChatId === chatId) {
        setSelectedChatId(undefined);
        setDialogue([]);
        setIsFirstMessage(true);
      }
    } catch (error) {
      console.error("Error deleting chat:", error);
    }
  };

  const isMacOS = useRef<boolean | null>(null);
  const osCheckComplete = useRef<boolean>(false);

  useEffect(() => {
    const checkOSTypeAndScroll = async () => {
      if (!osCheckComplete.current) {
        const osType = await type();
        isMacOS.current = osType === "Darwin";
        osCheckComplete.current = true;
      }

      if (messageContainerRef.current && isGenerating) {
        if (isMacOS.current) {
          messageContainerRef.current.scrollTo(
            0,
            messageContainerRef.current.scrollHeight
          );
        } else {
          debouncedScroll(messageContainerRef.current);
        }
      } else if (messageRef.current) {
        messageRef.current.scrollIntoView({
          behavior: "smooth",
          block: "end",
        });
      }
    };

    checkOSTypeAndScroll();
  }, [messageRef, dialogue, isGenerating, debouncedScroll]);

  const saveTokenData = (tokens: number) => {
    localStorage.setItem("dailyOutputTokens", tokens.toString());
    localStorage.setItem("lastResetTimestamp", new Date().toISOString());
  };

  const retrieveTokenData = () => {
    const storedTokens = localStorage.getItem("dailyOutputTokens");
    const storedTimestamp = localStorage.getItem("lastResetTimestamp");

    if (storedTokens && storedTimestamp) {
      const lastResetDate = new Date(storedTimestamp);
      const currentDate = new Date();

      if (
        lastResetDate.getDate() === currentDate.getDate() &&
        lastResetDate.getMonth() === currentDate.getMonth() &&
        lastResetDate.getFullYear() === currentDate.getFullYear()
      ) {
        setDailyOutputTokens(parseInt(storedTokens, 10));
        setLastResetTimestamp(storedTimestamp);
      } else {
        setDailyOutputTokens(0);
        setLastResetTimestamp(currentDate.toISOString());
        saveTokenData(0);
      }
    } else {
      setDailyOutputTokens(0);
      setLastResetTimestamp(new Date().toISOString());
      saveTokenData(0);
    }
  };

  const resetDailyOutputTokens = () => {
    const now = new Date();
    const midnight = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 1,
      0,
      0,
      0
    );
    const timeUntilMidnight = midnight.getTime() - now.getTime();

    setTimeout(() => {
      setDailyOutputTokens(0);
      setLastResetTimestamp(midnight.toISOString());
      saveTokenData(0);
    }, timeUntilMidnight);
  };

  const onClickNewChat = () => {
    setSelectedChatId(undefined);
    setDialogue([]);
    setIsFirstMessage(true);
    setIsGenerating(false);
    setFirstTokenReceived(false);
    setSelectedActivityTexts([]);
    selectActivity(null);
    setSelectedActivityText("");
  };

  return (
    <ScreenContainer>
      <ChatHeader
        profileMenu={<NavButton onClick={onSettingsOpen}>Settings</NavButton>}
      />
      <SidePanel
        gridArea={"sidebar"}
        pages={[
          {
            icon: <Folder size={20} />,
            text: "Documents",
            content: (
              <Projects
                selectedActivityId={state.selectedActivityId}
                onSelectActivity={selectActivity}
              />
            ),
          }, {
            icon: (
              <Tooltip label="Chat History" placement="bottom">
        <MessageCircle size={20} />
        </Tooltip>
            ),
            text: "Chats",
            content: (
              <ChatHistoryList
                chatHistory={chats}
                onNewChat={onClickNewChat}
                selectedChatId={selectedChatId}
                deleteChat={handleDeleteChat}
                selectChatId={(chatId) => {
                  setSelectedChatId(chatId);
                  setIsChatHistoryOpen(false);
                  setSelectedActivityTexts([]);
                }}
              />
            ),
          },
         
        ]}
      />
      <ChatContainer>
      {selectedActivityText || isLoadingActivityText ? (
  <ActivityTextContainer>
    <Box 
      width="100%"
      maxWidth="90%" /* Increased from var(--breakpoint-medium) to 90% of available width */
      padding="var(--space-l) var(--space-l) 0 var(--space-l)"
    >
{isLoadingActivityText ? (
  <>
    <Flex justify="center" mt={2}>
      <Text type="s">Loading document content...</Text>
    </Flex>
    <Flex justify="center" mt={2}>
      <Spinner />
    </Flex>
  </>
) : (
  <TipTapEditor
    content={selectedActivityText}
    title={selectedActivityName}
    isEditing={isEditing}
    documentId={state.selectedActivityId || 0} // Added documentId prop
    onEdit={handleEditText}
    onSave={handleSaveText}
    onCancel={() => setIsEditing(false)}
  />
)}
    </Box>
  </ActivityTextContainer>
) : (
          <>
            {dialogue.length === 0 && !isLoadingExistingChat ? (
              <NewConversationMessage />
            ) : (
              <MessagesScrollContainer ref={messageContainerRef}>
                <MessagesContainer>
                  {dialogue.map((message, index) => {
                    const messageProps =
                      index === dialogue.length - 1
                        ? {
                            ref: messageRef,
                          }
                        : {};
                    return (
                      <Fragment key={message.id}>
                        {message.role === "user" && (
                          <UserMessage
                            key={message.id}
                            message={message}
                            name={"You"}
                            {...messageProps}
                          />
                        )}
                        {message.role === "assistant" && (
                          <>
                            <AssistantMessage
                              key={message.id}
                              message={message}
                              isGenerating={isGenerating}
                              {...messageProps}
                            />
                            {index === 1 && windowTitles.length > 0 && (
                              <DocumentFootnote windowTitles={windowTitles} />
                            )}
                          </>
                        )}
                      </Fragment>
                    );
                  })}
                  {!firstTokenReceived && isGenerating && (
                    <Flex justify="center" mt={2}>
                      <Text type="s">Assistant is typing...</Text>
                    </Flex>
                  )}
                  {isGenerating && (
                    <Flex justify="center" mt={2}>
                      <Spinner />
                    </Flex>
                  )}
                </MessagesContainer>
                {isLoadingExistingChat && (
                  <Flex justify="center" mt={2}>
                    <Spinner />
                  </Flex>
                )}
              </MessagesScrollContainer>
            )}
          </>
        )}
        {selectedActivityTexts.length > 0 && (
          <Box mt={4} p={4} maxWidth="var(--breakpoint-medium)" mx="auto">
            <Box fontSize="sm" color="gray.500" mb={2}>Selected documents:</Box>
            <Wrap spacing={4}>
              {selectedActivityTexts.map((doc, index) => (
                <WrapItem key={index}>
                  <Flex>
                    <ActivityIcon>
                      <FileText size={24} />
                      <IconButton
                        icon={<X size={16} />}
                        size="xs"
                        aria-label="Remove document"
                        position="absolute"
                        top="-8px"
                        right="-8px"
                        borderRadius="full"
                        onClick={() => handleRemoveActivity(index)}
                      />
                    </ActivityIcon>
                    <ActivityPreview>
                      <DocName>
                        {doc.name.length > 25 ? `${doc.name.substring(0, 25)}...` : doc.name}
                      </DocName>
                      {doc.projectName && (
                        <ProjectName>
                          {doc.projectName}
                        </ProjectName>
                      )}
                    </ActivityPreview>
                  </Flex>
                </WrapItem>
              ))}
            </Wrap>
          </Box>
        )}
      <ChatInput
        value={userInput}
        onChange={handleInputChange}
        onKeyDown={handleKeyPress}
        onSubmit={handleSubmit}
        onActivityHistoryToggle={handleActivityHistoryToggle}
        isGenerating={isGenerating}
        isLoading={isLoading}
      />
      </ChatContainer>
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={onSettingsClose}
        activeCategory={activeSettingsCategory}
        setActiveCategory={setActiveSettingsCategory}
      />
      <SelectDocumentModal
        isOpen={isActivityHistoryOpen}
        onClose={handleActivityHistoryToggle}
        onSelect={handleActivitySelect}
      />
    </ScreenContainer>
  );
};