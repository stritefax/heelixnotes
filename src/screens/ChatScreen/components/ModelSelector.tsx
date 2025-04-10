import { FC, useState, useEffect } from "react";
import {
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  Button,
  Flex,
  Text,
} from "@chakra-ui/react";
import { ChevronDownIcon } from "@chakra-ui/icons";
import { useGlobalSettings } from "../../../Providers/SettingsProvider";

type ModelOption = {
  id: string;
  name: string;
  provider: "claude" | "openai";
  description: string;
};

type ModelSelectorProps = {
  onModelChange: (modelId: string, provider: "claude" | "openai") => void;
  currentModel?: string;
};

export const ModelSelector: FC<ModelSelectorProps> = ({ 
  onModelChange,
  currentModel: externalCurrentModel 
}) => {
  const { settings } = useGlobalSettings();
  const [currentModel, setCurrentModel] = useState<string>("");

  const modelOptions: ModelOption[] = [
    // Claude models
    {
      id: "claude-3-7-sonnet-20250219",
      name: "Claude 3.7 Sonnet",
      provider: "claude",
      description: "Main Anthropic model"
    },
    {
      id: "claude-3-5-haiku-20241022",
      name: "Claude 3.5 Haiku",
      provider: "claude", 
      description: "Latest Haiku model"
    },
    // OpenAI models
    {
      id: "gpt-4o",
      name: "GPT-4o",
      provider: "openai",
      description: "Latest OpenAI model"
    },
    {
      id: "o1",
      name: "O1",
      provider: "openai",
      description: "Advanced reasoning"
    },
    {
      id: "o3-mini",
      name: "O3-mini",
      provider: "openai",
      description: "Efficient reasoning"
    }
  ];

  // Initialize with external current model, or default if not provided
  useEffect(() => {
    if (externalCurrentModel) {
      setCurrentModel(externalCurrentModel);
    } else {
      // Set default model based on provider preference in settings
      const defaultModel = settings.api_choice === "claude" 
        ? "claude-3-7-sonnet-20250219" // Default Claude model is 3.7 Sonnet
        : "gpt-4o";                    // Default OpenAI model is GPT-4o
        
      setCurrentModel(defaultModel);
    }
  }, [externalCurrentModel, settings.api_choice]);

  const handleModelChange = (modelId: string) => {
    setCurrentModel(modelId);
    
    // Find the selected model to get its provider
    const selectedModel = modelOptions.find(model => model.id === modelId);
    
    if (selectedModel) {
      // Call the onModelChange prop with model ID and provider
      onModelChange(modelId, selectedModel.provider);
    }
  };

  // Get the current model's display info
  const currentModelInfo = modelOptions.find(m => m.id === currentModel);

  return (
    <Flex alignItems="center">
      <Menu>
        <MenuButton 
          as={Button} 
          rightIcon={<ChevronDownIcon />}
          size="sm"
          variant="outline"
         fontWeight="normal"  // Add this line to ensure normal font weight
        >
          {currentModelInfo ? currentModelInfo.name : "Select Model"}
        </MenuButton>
        <MenuList>
          {modelOptions.map((model) => (
            <MenuItem 
              key={model.id}
              onClick={() => handleModelChange(model.id)}
        //      fontWeight={currentModel === model.id ? "bold" : "normal"}
            >
              <Flex direction="column">
                <Text fontSize="sm">{model.name}</Text>
                <Text fontSize="xs" color="gray.500">{model.description}</Text>
              </Flex>
            </MenuItem>
          ))}
        </MenuList>
      </Menu>
    </Flex>
  );
};