import { type FC, useRef, useEffect } from "react";
import { Box, IconButton, List, ListItem, Flex } from "@chakra-ui/react";
import { Text } from "@heelix-app/design";
import { FaRegTrashAlt, FaPlus } from "react-icons/fa";
import styled from "styled-components";
import type { Chat } from "../screens/ChatScreen/types";

// 1) Create a styled container similar to your DocumentsContainer
const ChatHistoryContainer = styled(Box)`
  max-height: 80vh;     /* or 100vh if you want it to fill the entire viewport */
  width: 100%;
  max-width: 420px;     /* Increased width compared to your original 420px, for example */
  
  margin: 0 auto;
  overflow-y: auto;
  border-radius: var(--chakra-radii-md);

  &::-webkit-scrollbar {
    width: 8px;
  }
  
  &::-webkit-scrollbar-track {
    background: transparent;
    border-radius: 4px;
  }
  
  &::-webkit-scrollbar-thumb {
    background: var(--chakra-colors-gray-200);
    border-radius: 4px;
  }
  
  &::-webkit-scrollbar-thumb:hover {
    background: var(--chakra-colors-gray-300);
  }
`;

const NewChatContainer = styled.div`
  display: flex;
  align-items: center;
  flex: 1;
  gap: 8px;
  padding: 0 12px 0 0;
`;

type ChatHistoryListProps = {
  chatHistory: Chat[];
  selectChatId: (id: number | undefined) => void;
  onNewChat: () => void;
  selectedChatId: number | undefined;
  deleteChat: (id: number) => void;
};

export const ChatHistoryList: FC<ChatHistoryListProps> = ({
  chatHistory,
  onNewChat,
  selectChatId,
  selectedChatId,
  deleteChat,
}) => {
  const selectedChatRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    if (selectedChatRef.current?.scrollIntoView) {
      selectedChatRef.current.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [selectedChatRef]);

  return (
    // 2) Wrap your List in our new ChatHistoryContainer
    <ChatHistoryContainer>
      <List zIndex={101}>
        <ListItem
          key="new-chat"
          _hover={{ backgroundColor: "gray.100" }}
          cursor="pointer"
          onClick={onNewChat}
          padding="var(--space-default)"
          borderRadius="md"
          marginBottom={2}
          display="flex"
          justifyContent="space-between"
          alignItems="center"
        >
          <NewChatContainer>
            <FaPlus size={20} />
            <Text type="m" bold>
              New Chat
            </Text>
          </NewChatContainer>
        </ListItem>

        {chatHistory.map((chat) => {
          const itemProps =
            selectedChatId === chat.id
              ? { backgroundColor: "gray.200", ref: selectedChatRef }
              : { backgroundColor: "white" };
          return (
            <ListItem
              key={chat.id}
              _hover={{ backgroundColor: "gray.100" }}
              cursor="pointer"
              onClick={() => selectChatId(chat.id)}
              padding="var(--space-default)"
              borderRadius="md"
              marginBottom={2}
              display="flex"
              justifyContent="space-between"
              alignItems="center"
              {...itemProps}
            >
              <Flex alignItems="flex-start" flexGrow={1} paddingRight={4}>
                <Box
                  width="200px"
                  overflow="hidden"
                  textOverflow="ellipsis"
                  whiteSpace="nowrap"
                >
                  <Text type="m" bold>
                    {chat.name}
                  </Text>
                  <Text type="s">
                    {new Date(chat.updated_at).toLocaleString()}
                  </Text>
                </Box>
              </Flex>
              <IconButton
                aria-label="Delete Chat"
                onClick={(e) => {
                  e.stopPropagation();
                  deleteChat(chat.id);
                }}
                variant="ghost"
                size="sm"
                width={10}
              >
                <FaRegTrashAlt size={20} />
              </IconButton>
            </ListItem>
          );
        })}
      </List>
    </ChatHistoryContainer>
  );
};
