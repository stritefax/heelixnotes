import { useEffect, useState } from "react";
import {
  Box,
  Flex,
  Text,
  Switch,
  VStack,
  Input,
  Button,
  useToast,
} from "@chakra-ui/react";
import { useGlobalSettings } from "../Providers/SettingsProvider";

type LocalSettings = {
  autoStart: boolean;
  apiKeyOpenAi: string;
  apiKeyClaude: string;
  vectorizationEnabled: boolean;
  darkMode: boolean;
};
export const GeneralSettings = () => {
  const toast = useToast();
  const { settings, update } = useGlobalSettings();
  const [localSettings, setLocalSettings] = useState<LocalSettings>({
    autoStart: settings.auto_start,
    apiKeyOpenAi: settings.api_key_open_ai,
    apiKeyClaude: settings.api_key_claude,
    vectorizationEnabled: settings.vectorization_enabled,
    darkMode: settings.dark_mode,
  });

  useEffect(() => {
    setLocalSettings({
      autoStart: settings.auto_start,
      apiKeyOpenAi: settings.api_key_open_ai,
      apiKeyClaude: settings.api_key_claude,
      vectorizationEnabled: settings.vectorization_enabled,
      darkMode: settings.dark_mode,
    });
  }, [settings]);

  const savedSuccessfullyToast = () => {
    toast({
      title: "Settings saved successfully",
      status: "success",
      duration: 2000,
      isClosable: true,
    });
  };

  const handleAutoStartChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const isChecked = event.target.checked;
    await update({ ...settings, auto_start: isChecked });
  };

  const handleVectorizationToggle = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const isChecked = event.target.checked;
    setLocalSettings((prevState) => ({
      ...prevState,
      vectorizationEnabled: isChecked,
    }));
  };

  const handleDarkModeToggle = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const isChecked = event.target.checked;
    setLocalSettings((prevState) => ({
      ...prevState,
      darkMode: isChecked,
    }));
  };

  const onChangeOpenAiApiKey = (event: React.ChangeEvent<HTMLInputElement>) => {
    setLocalSettings((prevState) => ({
      ...prevState,
      apiKeyOpenAi: event.target.value,
    }));
  };
  const onChangeClaueApiKey = (event: React.ChangeEvent<HTMLInputElement>) => {
    setLocalSettings((prevState) => ({
      ...prevState,
      apiKeyClaude: event.target.value,
    }));
  };

  const onSave = () => {
    update({
      ...settings,
      auto_start: localSettings.autoStart,
      api_key_open_ai: localSettings.apiKeyOpenAi,
      api_key_claude: localSettings.apiKeyClaude,
      vectorization_enabled: localSettings.vectorizationEnabled,
      dark_mode: localSettings.darkMode,
    });
    savedSuccessfullyToast();
  };
  return (
    <Box>
      <VStack spacing={8} align="stretch">
        <Box>
          <Flex alignItems="center" mb={2}>
            <Text fontSize="md" mr={4}>
              Autostart Heelix:
            </Text>
            <Switch
              size="md"
              isChecked={localSettings.autoStart}
              onChange={handleAutoStartChange}
            />
          </Flex>
          <Text fontSize="sm" color="gray.500">
            Enable this option to automatically start the application on system
            startup.
          </Text>
        </Box>

        <Box>
          <Flex alignItems="center" mb={2}>
            <Flex flex={1}>
              <Text fontSize="md" mr={4}>
                OpenAI API Key:
              </Text>
            </Flex>
            <Flex flex={2}>
              <Input
                value={localSettings.apiKeyOpenAi}
                onChange={onChangeOpenAiApiKey}
              />
            </Flex>
          </Flex>
          <Flex alignItems="center" mb={2}>
            <Flex flex={1}>
              <Text fontSize="md" mr={4}>
                Claude API Key:
              </Text>
            </Flex>
            <Flex flex={2}>
              <Input
                value={localSettings.apiKeyClaude}
                onChange={onChangeClaueApiKey}
              />
            </Flex>
          </Flex>
          <Text fontSize="sm" color="gray.500">
            API keys are required for their respective models. Add the keys you plan to use.
          </Text>

          <Flex alignItems="center" mt={4} mb={2}>
            <Text fontSize="md" mr={4}>
              Enable Local Document Indexing:
            </Text>
            <Switch
              size="md"
              isChecked={localSettings.vectorizationEnabled}
              onChange={handleVectorizationToggle}
            />
          </Flex>
          <Text fontSize="sm" color="gray.500">
            When enabled, new documents will be indexed and used to augment queries when no project or attached text is selected. OpenAI API key is required to create embeddings. Disable if you prefer not to augment queries or index your documents.
          </Text>

          <Flex alignItems="center" mt={4} mb={2}>
            <Text fontSize="md" mr={4}>
              Dark Mode:
            </Text>
            <Switch
              size="md"
              isChecked={localSettings.darkMode}
              onChange={handleDarkModeToggle}
            />
          </Flex>
          <Text fontSize="sm" color="gray.500">
            Enable dark mode for a more comfortable viewing experience in low-light environments.
          </Text>

          <Flex flex={1} justifyContent="flex-end" mt={4}>
            <Button colorScheme="blue" size="md" onClick={onSave}>
              Save
            </Button>
          </Flex>
        </Box>
      </VStack>
    </Box>
  );
};
