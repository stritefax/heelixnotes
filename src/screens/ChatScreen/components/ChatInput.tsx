import {
  type FC,
  type ChangeEvent,
  type KeyboardEvent,
  useRef,
  useEffect,
  useState,
} from "react";
import {
  Text,
  Textarea,
  Button,
  Flex,
  IconButton,
  Tooltip,
  Box,
} from "@chakra-ui/react";
import { PaperclipIcon } from "lucide-react";
import { ProjectBadge } from "../../../features/ProjectBadge";
import { ModelSelector } from "./ModelSelector";
import { useGlobalSettings } from "../../../Providers/SettingsProvider";

type ChatInputProps = {
  value: string;
  onSubmit: (modelId?: string) => void; // Updated to accept modelId
  onChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onActivityHistoryToggle: () => void;
  isLoading: boolean;
  isGenerating: boolean;
};

export const ChatInput: FC<ChatInputProps> = ({
  value,
  onSubmit,
  onChange,
  onKeyDown,
  onActivityHistoryToggle,
  isLoading,
  isGenerating,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { settings } = useGlobalSettings();
  
  // Initialize with default model based on provider preference
  const defaultModel = settings.api_choice === "claude" 
    ? "claude-3-7-sonnet-20250219" // Default Claude model is 3.7 Sonnet
    : "gpt-4o";                    // Default OpenAI model is GPT-4o
  
  const [currentModel, setCurrentModel] = useState(defaultModel);
  const [currentProvider, setCurrentProvider] = useState<"claude" | "openai">(settings.api_choice);

  const handleInput = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "40px"; // Reset to initial height
      const scrollHeight = textareaRef.current.scrollHeight;
      textareaRef.current.style.height =
        scrollHeight > 40 ? `${scrollHeight}px` : "40px";
    }
  };

  useEffect(() => {
    handleInput();
  }, [value]);

  const handleSubmit = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "40px"; // Reset the height to the initial value
    }
    onSubmit(currentModel); // Pass the currently selected model to parent
  };

  const handleModelChange = (modelId: string, provider: "claude" | "openai") => {
    setCurrentModel(modelId);
    setCurrentProvider(provider);
  };

  return (
    <Box width="100%" maxWidth="var(--breakpoint-medium)" mx="auto" p={4}>
      <Flex justifyContent="space-between" alignItems="center" mb={2}>
        <Box>
          <ProjectBadge />
        </Box>
        <Box ml="auto">
          <ModelSelector 
            onModelChange={handleModelChange}
            currentModel={currentModel}
          />
        </Box>
      </Flex>
      
      <Flex
        as="form"
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit();
        }}
        flexDirection={"column"}
        alignItems={"flex-start"}
        width="100%"
        gap={"4px"}
      >
        <Flex alignItems="flex-end" width="100%">
          <Textarea
            value={value}
            ref={textareaRef}
            onChange={(e) => {
              onChange(e);
              handleInput();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              } else {
                onKeyDown(e);
              }
            }}
            placeholder="Type your message here..."
            resize="none"
            rows={1}
            mr={2}
            flex={1}
            disabled={isGenerating}
            height="40px"
            overflow="hidden"
          />
         <Tooltip label="Add document content to prompt" placement="top">
            <IconButton
              icon={<PaperclipIcon size={20} />}
              aria-label="Add document content"
              onClick={onActivityHistoryToggle}
              mr={2}
              variant="ghost"
              isRound
            />
          </Tooltip>
          <Button
            type="submit"
            isLoading={isLoading || isGenerating}
            loadingText="Sending"
            isDisabled={isGenerating || !value}
          >
            Send
          </Button>
        </Flex>
      </Flex>
    </Box>
  );
};