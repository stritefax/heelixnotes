import React, { useEffect } from "react";
import ReactDOM from "react-dom/client";
import { ThemeProvider } from "styled-components";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ChakraProvider, ColorModeScript, useColorMode } from "@chakra-ui/react";
import { extendTheme, type ThemeConfig } from "@chakra-ui/react";
import { attachConsole } from "tauri-plugin-log-api";
import "@heelix-app/design/index.css";
import { App } from "./App";
import { theme } from "./theme";
import { SettingsProvider } from "./Providers/SettingsProvider";
import { RecordingStateProvider } from "./Providers/RecordingStateProvider";
import { useGlobalSettings } from "./Providers/SettingsProvider";

const queryClient = new QueryClient();
const chakraTheme: ThemeConfig = extendTheme(theme);

attachConsole();

// Wrapper component to set color mode based on settings
const ThemedApp = () => {
  return (
    <SettingsProvider>
      <AppWithColorMode />
    </SettingsProvider>
  );
}

// Component that applies color mode from settings
const AppWithColorMode = () => {
  const { settings } = useGlobalSettings();
  const { colorMode, setColorMode } = useColorMode();
  
  useEffect(() => {
    // Set color mode based on settings
    if (settings.dark_mode && colorMode !== 'dark') {
      setColorMode('dark');
    } else if (!settings.dark_mode && colorMode !== 'light') {
      setColorMode('light');
    }
  }, [settings.dark_mode, colorMode, setColorMode]);

  return (
    <RecordingStateProvider>
      <App />
    </RecordingStateProvider>
  );
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={theme}>
        <ChakraProvider theme={chakraTheme}>
          <ColorModeScript initialColorMode="light" />
          <ThemedApp />
        </ChakraProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </React.StrictMode>
);
