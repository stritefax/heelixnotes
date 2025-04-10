import type { PropsWithChildren, FC } from "react";
import { createContext, useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api";
import { listen } from "@tauri-apps/api/event";
import dayjs from "dayjs";
import type { ActivityLogItem } from "./types";
import { buildActivityLogFromResponse } from "./utils";
import { useGlobalSettings } from "../SettingsProvider";
import { useUser } from "@/state/userState";

type RecordingState = {
  isRecording: boolean;
  activityTitle: string;
  activityTimeActive: number;
  activityLog: ActivityLogItem[];
};

type ToggleRecording = (isRecording?: RecordingState["isRecording"]) => void;
type SetTitle = (title: RecordingState["activityTitle"]) => void;
type SetActivityLog = (activityLog: RecordingState["activityLog"]) => void;
type RecordingStateContextType = {
  toggleRecording: ToggleRecording;
  setTitle: SetTitle;
  setActivityLog: SetActivityLog;
} & RecordingState;

const defaultRecordingState = {
  isRecording: false,
  activityTitle: " - ",
  activityTimeActive: 0,
  activityLog: [],
};
export const RecordingStateContext = createContext<RecordingStateContextType>({
  ...defaultRecordingState,
  toggleRecording: () => {},
  setTitle: () => {},
  setActivityLog: () => {},
});

export const RecordingStateProvider: FC<PropsWithChildren> = ({ children }) => {
  const { settings } = useGlobalSettings();
  const { user } = useUser();

  const [isRecording, setRecording] = useState<RecordingState["isRecording"]>(
    defaultRecordingState.isRecording
  );
  const [startRecordingTime, setStartRecordingTime] = useState(0);
  const [activityTitle, setActivityTitle] = useState<
    RecordingState["activityTitle"]
  >(defaultRecordingState.activityTitle);
  const [activityTimeActive, setActivityTimeActive] = useState<
    RecordingState["activityTimeActive"]
  >(defaultRecordingState.activityTimeActive);
  const [activityLog, setActivityLog] = useState<RecordingState["activityLog"]>(
    defaultRecordingState.activityLog
  );

  // ===== Handle recording =====
  let recordActivityInterval: NodeJS.Timeout;
  useEffect(() => {
    if (isRecording) {
      // Disabled interval to prevent recording
      console.log("Recording disabled - interval not set");
      
      // Original code commented out
      /*
      recordActivityInterval = setInterval(() => {
        console.log("taking a screenshot in interval");
        recordSingleActivity();
      }, +settings.interval * 1000);
      */
    } else {
      if (recordActivityInterval) {
        clearInterval(recordActivityInterval);
      }
    }
    return () => clearInterval(recordActivityInterval);
  }, [isRecording]);

  // ===== Update recording time =====
  useEffect(() => {
    if (startRecordingTime) {
      const interval = setInterval(() => {
        setActivityTimeActive(dayjs().unix() - startRecordingTime);
      }, 1000); // 1 sec

      return () => clearInterval(interval);
    }
  }, [startRecordingTime]);

  useEffect(() => {
    // Set recording to false by default
    toggleRecording(false);
    
    const unlisten = listen<string>("toggle_recording", (event) => {
      // Prevent toggling to true - keeps recording disabled
      console.log("Toggle recording requested but disabled");
      // toggleRecording();
    });

    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  const toggleRecording: ToggleRecording = (newIsRecording) => {
    // Force recording to always be off
    setRecording(false);
    setStartRecordingTime(0);
    
    // Original code commented out
    /*
    if (newIsRecording) {
      setRecording(newIsRecording);
    } else {
      setRecording((prevState) => !prevState);
      setStartRecordingTime(0);

      if (isRecording) {
        console.log("activity to close session!");
        recordSingleActivity();
      }
    }
    setStartRecordingTime(isRecording ? 0 : dayjs().unix());
    */
  };

  const recordSingleActivity = () => {
    // Disabled function - not calling the backend
    console.log("Recording single activity disabled");
    
    // Original code commented out
    /*
    invoke("record_single_activity", {
      user: user.id,
    }).then((response) => {
      let activityLog = buildActivityLogFromResponse(response);
      setActivityLog(activityLog);
      setActivityTitle(activityLog[activityLog.length - 1].window_title);
    });
    */
  };

  const setTitle: SetTitle = (title) => {
    setActivityTitle(title);
  };

  return (
    <RecordingStateContext.Provider
      value={{
        isRecording,
        activityTitle,
        activityTimeActive,
        activityLog,
        toggleRecording,
        setTitle,
        setActivityLog,
      }}
    >
      {children}
    </RecordingStateContext.Provider>
  );
};