import { type FC, useState, useMemo, useRef, useEffect } from "react";
import styled from "styled-components";
import { invoke } from '@tauri-apps/api/tauri';
import { 
  Box, 
  Menu, 
  MenuButton, 
  MenuList, 
  MenuItem, 
  IconButton, 
  Flex, 
  Badge,
  Tooltip,
  Divider,
  Input,
  InputGroup,
  InputLeftElement,
  Text as ChakraText,
  Tag,
  TagLabel,
  TagCloseButton,
  AlertDialog,
  AlertDialogBody,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogContent,
  AlertDialogOverlay,
  Button,
  Checkbox,
  useDisclosure,
  useToast,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalCloseButton,
  ModalBody,
  ModalFooter
} from "@chakra-ui/react";
import { 
  Search, 
  File, 
  Trash2, 
  Edit, 
  X, 
  MoreHorizontal, 
  FilePlus, 
  FolderPlus,
  Mic,
  Square,
  Headphones,
  FileUp
} from 'lucide-react';
import { Text } from "@heelix-app/design";
import { useProject } from "../../state";
import { ProjectModal } from "@/components";
import { type Project } from "../../data/project";
import { open } from '@tauri-apps/api/dialog';
import { listen } from '@tauri-apps/api/event';
import { appConfigDir } from '@tauri-apps/api/path';
import { writeTextFile, readTextFile } from '@tauri-apps/api/fs';

//
// -- Styled Components --
const Container = styled(Box)`
  display: flex;
  flex: 1;
  flex-direction: column;
  padding: var(--space-l);
  gap: var(--space-l);
  width: 100%;
  max-width: 420px; /* Increased width to occupy more space */
  margin: 0 auto;
  overflow: hidden;
`;

const StyledMenuButton = styled(MenuButton)`
  background-color: white;
  border: 1px solid var(--chakra-colors-gray-200);
  border-radius: var(--chakra-radii-md);
  padding: 8px 12px;
  height: 40px;
  display: flex;
  align-items: center;
  width: 100%;
  transition: all 0.2s;
  
  &:hover {
    background-color: var(--chakra-colors-gray-50);
    border-color: var(--chakra-colors-gray-300);
  }
  
  &:focus {
    box-shadow: 0 0 0 2px var(--chakra-colors-blue-100);
    border-color: var(--chakra-colors-blue-500);
  }
`;

const ScrollableMenuList = styled(MenuList)`
  max-height: 300px;
  overflow-y: auto;
  
  /* Custom scrollbar styling */
  &::-webkit-scrollbar {
    width: 8px;
  }
  
  &::-webkit-scrollbar-track {
    background: var(--chakra-colors-gray-100);
    border-radius: 4px;
  }
  
  &::-webkit-scrollbar-thumb {
    background: var(--chakra-colors-gray-300);
    border-radius: 4px;
  }
  
  &::-webkit-scrollbar-thumb:hover {
    background: var(--chakra-colors-gray-400);
  }
`;

const DocumentsContainer = styled(Box)`
  max-height: 500px;
  overflow-y: auto;
  border-radius: var(--chakra-radii-md);
  
  /* Custom scrollbar styling */
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

const ProjectHeader = styled(Box)`
  background-color: var(--chakra-colors-gray-50);
  padding: 8px 12px;
  font-size: 12px;
  font-weight: 500;
  color: var(--chakra-colors-gray-600);
  border-bottom: 1px solid var(--chakra-colors-gray-200);
`;

const DocumentName = styled(ChakraText)`
  font-size: 14px;
  line-height: 1.4;
  font-weight: 400;
  color: var(--chakra-colors-gray-800);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
  max-height: 40px; /* 2 lines * line height */
  max-width: calc(100% - 60px); /* Added more space for the three dots menu */
  padding-right: 4px; /* Extra padding to ensure separation */
`;

const ProjectTag = styled(Tag)`
  position: absolute;
  bottom: 8px;
  right: 8px;
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 12px;
  background-color: var(--chakra-colors-gray-100);
  color: var(--chakra-colors-gray-600);
  z-index: 1;
`;

const UnassignedTag = styled(Tag)`
  position: absolute;
  bottom: 8px;
  right: 8px;
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 12px;
  background-color: var(--chakra-colors-gray-100);
  color: var(--chakra-colors-gray-500);
  font-style: italic;
  z-index: 1;
`;

const SearchContainer = styled(Box)`
  margin-bottom: 10px;
`;

const truncateDocumentName = (name: string, maxLength: number = 30) => {
  if (name.length <= maxLength) return name;
  return `${name.substring(0, maxLength)}...`;
};

const UNASSIGNED_PROJECT_NAME = "Unassigned";

// DeleteProjectButton component for project deletion
const DeleteProjectButton: FC<{
  project: Project;
  onDelete: (project: Project) => void;
}> = ({ project, onDelete }) => {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const cancelRef = useRef(null);
  
  return (
    <>
      <Tooltip label="Delete this project">
        <IconButton
          aria-label="Delete project"
          icon={<Trash2 size={16} />}
          size="sm"
          variant="ghost"
          onClick={onOpen}
        />
      </Tooltip>
      
      <AlertDialog
        isOpen={isOpen}
        leastDestructiveRef={cancelRef}
        onClose={onClose}
      >
        <AlertDialogOverlay>
          <AlertDialogContent>
            <AlertDialogHeader fontSize="lg" fontWeight="bold">
              Delete Project
            </AlertDialogHeader>
            
            <AlertDialogBody>
              Are you sure you want to delete "{project.name}"? 
              This action cannot be undone.
            </AlertDialogBody>
            
            <AlertDialogFooter>
              <Button ref={cancelRef} onClick={onClose}>
                Cancel
              </Button>
              <Button 
                colorScheme="red" 
                onClick={() => {
                  onDelete(project);
                  onClose();
                }} 
                ml={3}
              >
                Delete
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialogOverlay>
      </AlertDialog>
    </>
  );
};

//
// -- Main Export --
export const Projects: FC<{
  selectedActivityId: number | null;
  onSelectActivity: (activityId: number | null) => void;
}> = ({ selectedActivityId, onSelectActivity }) => {
  const { 
    state, 
    selectProjects,
    toggleProjectSelection,
    getSelectedProjects,
    addProject, 
    deleteProject, 
    updateProject,
    updateActivityName,
    addBlankActivity,
    addUnassignedActivity,
    deleteActivity,
    tagDocumentWithProject,
    untagDocumentFromProject,
    getDocumentProjects,
    updateActivityContent
  } = useProject();
  
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<null | number>(null);

  // Get currently selected projects
  const selectedProjects = useMemo(() => 
    getSelectedProjects(),
    [state.selectedProjects]
  );

  // Filter out the unassigned project for the dropdown
  const visibleProjects = useMemo(() => 
    state.projects.filter(p => p.name !== UNASSIGNED_PROJECT_NAME),
    [state.projects]
  );

  const handleProjectSelect = (project: Project) => {
    selectProjects([project.id]);
  };

  const handleToggleProjectSelection = (project: Project) => {
    toggleProjectSelection(project.id);
  };

  const handleUnselectProjects = () => {
    selectProjects([]);
  };

  const handleNewProject = () => {
    setSelectedProjectId(null);
    setModalOpen(true);
  };

  const handleEditProject = (project: Project) => {
    setSelectedProjectId(project.id);
    setModalOpen(true);
  };

  const handleDeleteProject = (project: Project) => {
    deleteProject(project.id);
  };

  const handleClose = () => {
    setModalOpen(false);
    setSelectedProjectId(null);
  };

  const handleActivitySelect = (activityId: number) => {
    onSelectActivity(activityId);
  };

  return (
    <Container>
      <ProjectSelector
        projects={visibleProjects}
        allProjects={state.projects}
        selectedProjects={selectedProjects}
        onSelectProjects={(projects: Project[]) => {
          selectProjects(projects.map(p => p.id));
        }}
        onToggleProjectSelection={handleToggleProjectSelection}
        onUnselectProjects={handleUnselectProjects}
        onNewProject={handleNewProject}
        onEditProject={handleEditProject}
        onDeleteProject={handleDeleteProject}
        selectedActivityId={selectedActivityId}
        onSelectActivity={handleActivitySelect}
        onUpdateActivityName={updateActivityName}
        onAddBlankActivity={addBlankActivity}
        onAddUnassignedActivity={addUnassignedActivity}
        onDeleteActivity={deleteActivity}
        onTagDocument={tagDocumentWithProject}
        onUntagDocument={untagDocumentFromProject}
        onGetDocumentProjects={getDocumentProjects}
        onUpdateActivityContent={updateActivityContent}
      />
      
      <ProjectModal
        isOpen={modalOpen}
        projectId={selectedProjectId}
        onClose={handleClose}
        onUpdate={updateProject}
        onSave={addProject}
      />
    </Container>
  );
};

//
// -- ProjectSelector Component --
type ActivityDocument = {
  id: number;
  activity_id: number | null;
  name: string;
  projectId: number;
  projectName: string;
  allProjects?: { id: number, name: string }[];
};

const ProjectSelector: FC<{
  projects: Project[];
  allProjects: Project[];
  selectedProjects: Project[];
  onSelectProjects: (projects: Project[]) => void;
  onToggleProjectSelection: (project: Project) => void;
  onUnselectProjects: () => void;
  onNewProject: () => void;
  onEditProject: (project: Project) => void;
  onDeleteProject: (project: Project) => void;
  selectedActivityId: number | null;
  onSelectActivity: (activityId: number) => void;
  onUpdateActivityName: (activityId: number, name: string) => void;
  onAddBlankActivity: () => Promise<number | undefined>;
  onAddUnassignedActivity: () => Promise<number | undefined>;
  onDeleteActivity: (activityId: number) => void;
  onTagDocument: (documentId: number, projectId: number) => Promise<boolean>;
  onUntagDocument: (documentId: number, projectId: number) => Promise<boolean>;
  onGetDocumentProjects: (documentId: number) => Promise<number[]>;
  onUpdateActivityContent?: (activityId: number, content: string) => void;
}> = ({
  projects,
  allProjects,
  selectedProjects,
  onSelectProjects,
  onToggleProjectSelection,
  onUnselectProjects,
  onNewProject,
  onEditProject,
  onDeleteProject,
  selectedActivityId,
  onSelectActivity,
  onUpdateActivityName,
  onAddBlankActivity,
  onAddUnassignedActivity,
  onDeleteActivity,
  onTagDocument,
  onUntagDocument,
  onGetDocumentProjects,
  onUpdateActivityContent
}) => {
  const [editingActivityId, setEditingActivityId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [documentSearchTerm, setDocumentSearchTerm] = useState("");
  const [documentProjectTags, setDocumentProjectTags] = useState<{[key: number]: number[]}>({});
  // Add state for tag management modal
  const [tagModalOpen, setTagModalOpen] = useState(false);
  const [currentDocument, setCurrentDocument] = useState<ActivityDocument | null>(null);
  
  // Add voice note recording states
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioURL, setAudioURL] = useState<string | null>(null);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isProcessingRecording, setIsProcessingRecording] = useState(false);
  const timerRef = useRef<number | null>(null);
  const recordingStartTime = useRef<number | null>(null);
  const audioChunks = useRef<Blob[]>([]);
  
  // Add a state to store the current recording file path
  const [recordingFilePath, setRecordingFilePath] = useState<string | null>(null);
  
  // Add toast
  const toast = useToast();
  
  // Add temp state for tag changes in modal
  const [tempTags, setTempTags] = useState<Set<number>>(new Set());
  
  // Function to format recording time as mm:ss
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };
  
  // Start recording function
  const startRecording = async () => {
    try {
      // Check if OpenAI API key is set before starting recording
      const settings = await invoke<{api_key_open_ai: string}>('get_openai_api_key');
      
      if (!settings.api_key_open_ai) {
        toast({
          title: "API key required",
          description: "An OpenAI API key is required for voice note transcription.",
          status: "warning",
          duration: 10000,
          isClosable: true,
          position: "top",
          render: ({ onClose }) => (
            <Box 
              p={4} 
              bg="yellow.100" 
              color="yellow.800" 
              borderRadius="md" 
              boxShadow="md"
            >
              <Flex direction="column" gap={3}>
                <ChakraText fontWeight="bold">API Key Required</ChakraText>
                <ChakraText>
                  An OpenAI API key is required for voice note transcription.
                  Please add it in the Settings menu (top-right corner).
                </ChakraText>
                <Flex justify="flex-end">
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    onClick={onClose}
                  >
                    Close
                  </Button>
                </Flex>
              </Flex>
            </Box>
          )
        });
        return;
      }
      
      // Reset audio state
      setAudioURL(null);
      setAudioBlob(null);
      setRecordingFilePath(null);
      setRecordingTime(0);
      
      // Call the Tauri command to start recording
      const filePath = await invoke<string>('start_audio_recording');
      setRecordingFilePath(filePath);
      console.log("Recording started, file path:", filePath);
      
      // Start timer using actual timestamps for more accuracy
      recordingStartTime.current = Date.now();
      timerRef.current = window.setInterval(() => {
        if (recordingStartTime.current) {
          const elapsedSeconds = Math.floor((Date.now() - recordingStartTime.current) / 1000);
          setRecordingTime(elapsedSeconds);
        }
      }, 1000);
      
      setIsRecording(true);
    } catch (error) {
      console.error("Failed to start recording:", error);
      toast({
        title: "Recording failed",
        description: "Could not start voice recording. Please try again.",
        status: "error",
        duration: 3000,
        isClosable: true,
      });
    }
  };
  
  // Stop recording function
  const stopRecording = async () => {
    try {
      // Show processing state immediately
      setIsProcessingRecording(true);
      setIsRecording(false);
      
      // Clear timer
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      
      // Final time snapshot for accuracy
      if (recordingStartTime.current) {
        const elapsedSeconds = Math.floor((Date.now() - recordingStartTime.current) / 1000);
        setRecordingTime(elapsedSeconds);
        recordingStartTime.current = null;
      }
      
      // Call the Tauri command to stop recording
      const filePath = await invoke<string>('stop_audio_recording');
      setRecordingFilePath(filePath);
      console.log("Recording stopped, file path:", filePath);
      
      // Delay reading the file to improve UI responsiveness
      setTimeout(async () => {
        try {
          // Read the file using Tauri's fs API
          const audioBytes = await invoke<number[]>('read_audio_file', { filePath });
          const audioArray = new Uint8Array(audioBytes);
          const blob = new Blob([audioArray], { type: 'audio/wav' });
          setAudioBlob(blob);
          const url = URL.createObjectURL(blob);
          setAudioURL(url);
        } catch (readError) {
          console.error("Failed to read audio file:", readError);
          toast({
            title: "Error reading recording",
            description: "Could not load the audio recording for playback.",
            status: "error",
            duration: 3000,
            isClosable: true,
          });
        } finally {
          setIsProcessingRecording(false);
        }
      }, 100); // Small delay to allow UI to update
      
    } catch (error) {
      console.error("Failed to stop recording:", error);
      setIsProcessingRecording(false);
      toast({
        title: "Recording error",
        description: "An error occurred while stopping the recording.",
        status: "error",
        duration: 3000,
        isClosable: true,
      });
    }
  };
  
  // Function to transcribe audio
  const transcribeAudio = async () => {
    if (!recordingFilePath) {
      console.error("No recording file path available");
      toast({
        title: "Transcription failed",
        description: "No recording file available",
        status: "error",
        duration: 3000,
        isClosable: true,
      });
      return;
    }
    
    try {
      setIsTranscribing(true);
      
      // Call transcription API directly with the file path
      const transcription = await invoke<string>('transcribe_audio', { 
        filePath: recordingFilePath 
      }).catch(error => {
        console.error("Transcription API error:", error);
        toast({
          title: "Transcription failed",
          description: error.toString().includes("OpenAI API key") 
            ? "OpenAI API key is required for audio transcription. Please add it in Settings." 
            : "Failed to transcribe audio. Please try again.",
          status: "error",
          duration: 5000,
          isClosable: true,
        });
        throw error;
      });
      
      // Create a new activity with the transcription
      let newActivityId;
      
      if (selectedProjects.length > 0) {
        console.log('Creating voice note in selected projects:', selectedProjects.map(p => p.name));
        newActivityId = await onAddBlankActivity();
      } else {
        console.log('Creating voice note in unassigned project');
        newActivityId = await onAddUnassignedActivity();
      }
      
      if (newActivityId) {
        // Name the document with the current date and time
        const date = new Date();
        const documentName = `Voice Note ${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
        
        // Update the name and content
        await onUpdateActivityName(newActivityId, documentName);
        
        // Update content if available
        if (onUpdateActivityContent) {
          await onUpdateActivityContent(newActivityId, transcription);
        } else {
          // Fallback to direct invoke
          await invoke("update_project_activity_text", {
            activityId: newActivityId,
            text: transcription
          });
        }
        
        // Clear audio state
        setAudioBlob(null);
        setAudioURL(null);
        setRecordingFilePath(null);
        
        // Show success message
        toast({
          title: "Transcription complete",
          description: "Voice note has been transcribed and saved successfully",
          status: "success",
          duration: 3000,
          isClosable: true,
        });
      }
      
      setIsTranscribing(false);
      
    } catch (error) {
      console.error("Error during transcription process:", error);
      setIsTranscribing(false);
    }
  };
  
  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  // Filter projects by name
  const filteredProjects = useMemo(() => {
    if (!searchTerm.trim()) return projects;
    return projects.filter((p) =>
      p.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [projects, searchTerm]);

  // Get all activities across all projects or from the selected project only
  const allDocuments = useMemo(() => {
    // Step 1: Collect all documents with their project associations
    let documentMap = new Map<number, {
      id: number;
      activity_id: number | null;
      name: string;
      projects: { id: number, name: string }[];
    }>();
    
    // Choose which projects to consider based on selection
    const projectsToUse = selectedProjects.length > 0 ? selectedProjects : allProjects;
    
    // Map through all projects and collect document info
    projectsToUse.forEach(project => {
      project.activities.forEach((_, index) => {
        const docId = project.activities[index];
        const docName = project.activity_names[index] || `Document ${docId}`;
        const activityId = project.activity_ids[index];
        
        // If document already exists in map, add this project to its projects array
        if (documentMap.has(docId)) {
          documentMap.get(docId)?.projects.push({
            id: project.id,
            name: project.name
          });
        } else {
          // Otherwise create a new document entry
          documentMap.set(docId, {
            id: docId,
            activity_id: activityId,
            name: docName,
            projects: [{ id: project.id, name: project.name }]
          });
        }
      });
    });
    
    // Step 2: Convert map to array and format for display
    return Array.from(documentMap.values()).map(doc => ({
      id: doc.id,
      activity_id: doc.activity_id,
      name: doc.name,
      // Use first project as primary for compatibility
      projectId: doc.projects[0].id,
      projectName: doc.projects[0].name,
      // Store all projects for reference
      allProjects: doc.projects
    }));
  }, [selectedProjects, allProjects]);

  // Filter documents by name/project name
  const filteredDocuments = useMemo(() => {
    if (!documentSearchTerm.trim()) return allDocuments;
    return allDocuments.filter(doc => 
      doc.name.toLowerCase().includes(documentSearchTerm.toLowerCase()) ||
      doc.projectName.toLowerCase().includes(documentSearchTerm.toLowerCase())
    );
  }, [allDocuments, documentSearchTerm]);

  // Sort documents by descending ID for recency
  const sortedDocuments = useMemo(() => {
    return [...filteredDocuments].sort((a, b) => b.id - a.id);
  }, [filteredDocuments]);

  // Start renaming a document
  const handleStartEdit = (activity: { id: number; name: string }) => {
    setEditingActivityId(activity.id);
    setEditingName(activity.name);
  };

  // Save document name change
  const handleSaveEdit = () => {
    if (editingActivityId && editingName.trim()) {
      onUpdateActivityName(editingActivityId, editingName.trim());
      setEditingActivityId(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveEdit();
    } else if (e.key === 'Escape') {
      setEditingActivityId(null);
    }
  };

  // Create a new document in selected or unassigned project
  const handleAddNewDocument = async () => {
    let newActivityId;
    
    // Use the first selected project or create in unassigned
    const primaryProject = selectedProjects.length > 0 ? selectedProjects[0] : null;
    
    if (primaryProject) {
      newActivityId = await onAddBlankActivity();
    } else {
      newActivityId = await onAddUnassignedActivity();
    }
    
    if (newActivityId) {
      // If multiple projects are selected, tag the document with all of them
      if (selectedProjects.length > 1) {
        for (let i = 1; i < selectedProjects.length; i++) {
          await onTagDocument(newActivityId, selectedProjects[i].id);
        }
      }
      
      handleStartEdit({ id: newActivityId, name: "New Document" });
    }
  };

  // Select a document without forcing a project switch
  const handleDocumentSelect = (document: ActivityDocument) => {
    onSelectActivity(document.id);
  };

  // Delete a document
  const handleDeleteDocument = (e: React.MouseEvent, document: ActivityDocument) => {
    e.stopPropagation();
    onDeleteActivity(document.id);
  };

  // Handle paste events to create new documents
  const handlePaste = async (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedText = e.clipboardData.getData('text');
    
    console.log('Paste event detected, text length:', pastedText.length);
    
    if (pastedText.trim()) {
      let newActivityId;
      
      try {
        if (selectedProjects.length > 0) {
          console.log('Creating document in selected projects:', selectedProjects.map(p => p.name));
          newActivityId = await onAddBlankActivity();
        } else {
          console.log('Creating document in unassigned project');
          newActivityId = await onAddUnassignedActivity();
        }
        
        console.log('New activity ID created:', newActivityId);
        
        if (newActivityId) {
          // Set the name to first line or truncated text
          const firstLine = pastedText.split('\n')[0].trim();
          const documentName = firstLine ? 
            (firstLine.length > 30 ? firstLine.substring(0, 30) + '...' : firstLine) : 
            'Pasted Document';
          
          console.log('Setting document name:', documentName);
          await onUpdateActivityName(newActivityId, documentName);
          
          // Update the content of the new activity with the pasted text
          console.log('Updating document content, text size:', pastedText.length);
          
          // Try multiple approaches to ensure content is updated
          let contentUpdateSuccess = false;
          
          // First try the callback if available
          if (onUpdateActivityContent) {
            try {
              await onUpdateActivityContent(newActivityId, pastedText);
              console.log('Document content updated successfully via callback');
              contentUpdateSuccess = true;
            } catch (error) {
              console.error('Failed to update document content via callback:', error);
            }
          } else {
            console.error('onUpdateActivityContent is not available');
          }
          
          // If callback fails, try direct Tauri invoke as fallback
          if (!contentUpdateSuccess) {
            try {
              console.log('Trying direct Tauri invoke as fallback');
              await invoke("update_project_activity_text", {
                activityId: newActivityId,
                text: pastedText
              });
              console.log('Document content updated successfully via direct invoke');
              contentUpdateSuccess = true;
            } catch (error) {
              console.error('Failed to update document content via direct invoke:', error);
            }
          }
          
          // Select the new document
          console.log('Selecting new document');
          onSelectActivity(newActivityId);
        }
      } catch (error) {
        console.error('Error during paste processing:', error);
      }
    }
  };

  // Add function to discard the recording
  const discardRecording = () => {
    // Release URL object to prevent memory leaks
    if (audioURL) {
      URL.revokeObjectURL(audioURL);
    }
    
    // Reset all recording-related states
    setAudioURL(null);
    setAudioBlob(null);
    setRecordingFilePath(null);
    setRecordingTime(0);
    setIsProcessingRecording(false);
  };

  // Handle file import
  const handleFileImport = async () => {
    try {
      // Open file dialog to select files
      const selected = await open({
        multiple: false,
        filters: [{
          name: 'Documents',
          extensions: ['pdf', 'docx', 'txt', 'md', 'rtf']
        }]
      });
      
      if (!selected || Array.isArray(selected)) return;
      
      // Show loading toast
      const loadingToast = toast({
        title: "Importing document",
        description: "Please wait while we process your file...",
        status: "info",
        duration: null,
        isClosable: false,
      });
      
      try {
        // Extract text from file using Tauri command
        const extractedText = await invoke<string>('extract_document_text', { 
          filePath: selected
        });
        
        // Get filename without extension for the document title
        const fileName = selected.split('/').pop() || '';
        const documentName = fileName.includes('.') 
          ? fileName.substring(0, fileName.lastIndexOf('.'))
          : fileName;
        
        // Create new activity
        let newActivityId;
        if (selectedProjects.length > 0) {
          newActivityId = await onAddBlankActivity();
        } else {
          newActivityId = await onAddUnassignedActivity();
        }
        
        if (newActivityId && extractedText) {
          // Update activity name and content
          await onUpdateActivityName(newActivityId, documentName);
          
          if (onUpdateActivityContent) {
            await onUpdateActivityContent(newActivityId, extractedText);
          } else {
            // Fallback to direct invoke
            await invoke("update_project_activity_text", {
              activityId: newActivityId,
              text: extractedText
            });
          }
          
          // Select the new document
          onSelectActivity(newActivityId);
          
          // Close loading toast and show success
          toast.close(loadingToast);
          toast({
            title: "Import successful",
            description: `"${documentName}" has been imported successfully.`,
            status: "success",
            duration: 3000,
            isClosable: true,
          });
        }
      } catch (error) {
        console.error("Error importing document:", error);
        toast.close(loadingToast);
        toast({
          title: "Import failed",
          description: "Failed to import document. Please try again.",
          status: "error",
          duration: 5000,
          isClosable: true,
        });
      }
    } catch (error) {
      console.error("Error selecting file:", error);
    }
  };

  // Function to fetch document projects and update state
  const fetchDocumentProjects = async (documentId: number) => {
    const projectIds = await onGetDocumentProjects(documentId);
    
    // Update the documentProjectTags state (still useful as backup)
    setDocumentProjectTags(prev => ({
      ...prev,
      [documentId]: projectIds
    }));
    
    // Find the document in our allDocuments list and update its allProjects
    const documentToUpdate = sortedDocuments.find(doc => doc.id === documentId);
    if (documentToUpdate) {
      // Get project objects for each ID
      const projectObjects = projectIds.map(id => {
        const project = allProjects.find(p => p.id === id);
        return project ? { id, name: project.name } : { id, name: "Unknown" };
      });
      
      // Update the document's allProjects property
      documentToUpdate.allProjects = projectObjects;
    }
    
    return projectIds;
  };

  // Load project tags for visible documents only when needed
  useEffect(() => {
    // Only fetch tags for documents that don't already have allProjects populated
    sortedDocuments
      .filter(doc => !doc.allProjects || doc.allProjects.length === 0)
      .forEach(doc => {
        fetchDocumentProjects(doc.id);
      });
  }, [sortedDocuments]);

  // Handle Project Tags
  const handleAddProjectTag = async (documentId: number, projectId: number) => {
    const success = await onTagDocument(documentId, projectId);
    if (success) {
      // Update the projects for this document
      const projectIds = await onGetDocumentProjects(documentId);
      setDocumentProjectTags(prev => ({
        ...prev,
        [documentId]: projectIds
      }));
      
      // Refresh documents to update allProjects
      const selectedDocs = selectedProjects.length > 0 ? selectedProjects : allProjects;
      if (currentDocument) {
        // Find the project to add
        const projectToAdd = allProjects.find(p => p.id === projectId);
        if (projectToAdd && currentDocument.allProjects) {
          // Only add if it doesn't already exist
          if (!currentDocument.allProjects.some(p => p.id === projectId)) {
            currentDocument.allProjects.push({
              id: projectId,
              name: projectToAdd.name
            });
          }
        }
      }
    }
  };

  const handleRemoveProjectTag = async (documentId: number, projectId: number) => {
    const success = await onUntagDocument(documentId, projectId);
    if (success) {
      // Update the projects for this document
      const projectIds = await onGetDocumentProjects(documentId);
      setDocumentProjectTags(prev => ({
        ...prev,
        [documentId]: projectIds
      }));
      
      // Update the currentDocument if it's being edited
      if (currentDocument && currentDocument.allProjects) {
        // Remove the project from allProjects
        currentDocument.allProjects = currentDocument.allProjects.filter(
          p => p.id !== projectId
        );
      }
    }
  };

  // Function to get project name by ID
  const getProjectNameById = (projectId: number): string => {
    const project = allProjects.find(p => p.id === projectId);
    return project ? project.name : "Unknown";
  };

  // Project selection display for menu
  const renderProjectsSelectionInfo = () => {
    if (selectedProjects.length === 0) {
      return 'Select Projects';
    } else if (selectedProjects.length === 1) {
      return selectedProjects[0].name;
    } else {
      return `${selectedProjects.length} Projects Selected`;
    }
  };

  // Function to handle saving tag changes
  const handleSaveProjectTags = async () => {
    if (!currentDocument) return;
    
    // Get current tags
    const currentTags = documentProjectTags[currentDocument.id] || [];
    const currentTagSet = new Set(currentTags);
    
    // Find tags to add (in tempTags but not in current tags)
    const tagsToAdd = Array.from(tempTags).filter(tag => !currentTagSet.has(tag));
    
    // Find tags to remove (in current tags but not in tempTags)
    const tagsToRemove = currentTags.filter(tag => !tempTags.has(tag));
    
    // Add new tags
    for (const tagId of tagsToAdd) {
      await onTagDocument(currentDocument.id, tagId);
    }
    
    // Remove tags
    for (const tagId of tagsToRemove) {
      await onUntagDocument(currentDocument.id, tagId);
    }
    
    // Refresh document tags
    await fetchDocumentProjects(currentDocument.id);
    
    // Force refresh of all document tags
    sortedDocuments.forEach(doc => {
      fetchDocumentProjects(doc.id);
    });
    
    // Close modal
    setTagModalOpen(false);
  };
  
  // Function to handle checkbox changes in the modal
  const handleTempTagToggle = (projectId: number) => {
    setTempTags(prev => {
      const newTags = new Set(prev);
      if (newTags.has(projectId)) {
        newTags.delete(projectId);
      } else {
        newTags.add(projectId);
      }
      return newTags;
    });
  };
  
  // Initialize temp tags when modal opens
  useEffect(() => {
    if (currentDocument && tagModalOpen) {
      // Initialize with current tags
      const currentTags = documentProjectTags[currentDocument.id] || [];
      setTempTags(new Set(currentTags));
    }
  }, [currentDocument, tagModalOpen]);

  return (
    <Flex direction="column" w="full" gap={4} overflow="hidden">
      <Flex gap={2} w="full" align="center">
        <Menu closeOnSelect={false}>
          <Flex position="relative" w="full">
            <StyledMenuButton w="full">
              <Text type="m" bold>
                {renderProjectsSelectionInfo()}
              </Text>
            </StyledMenuButton>

            {selectedProjects.length > 0 && (
              <IconButton
                position="absolute"
                right="2"
                top="50%"
                transform="translateY(-50%)"
                aria-label="Unselect projects"
                icon={<X size={14} />}
                size="xs"
                variant="ghost"
                zIndex="1"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onUnselectProjects();
                }}
                _hover={{ bg: 'gray.100' }}
              />
            )}
          </Flex>

          <ScrollableMenuList minW="240px" w="240px" py={0}>
            {/* Sticky search box */}
            <Box 
              p={2} 
              h="56px" 
              display="flex" 
              alignItems="center" 
              position="sticky" 
              top="0" 
              bg="white" 
              zIndex="1"
            >
              <InputGroup size="sm">
                <InputLeftElement pointerEvents="none">
                  <Search size={14} color="var(--chakra-colors-gray-400)" />
                </InputLeftElement>
                <Input
                  placeholder="Search Projects..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck="false"
                />
              </InputGroup>
            </Box>
            <Divider my={0} />

            {/* "Create New Project" at the top */}
            <MenuItem 
              icon={<FolderPlus size={16} />}
              onClick={onNewProject}
              p={3}
              h="40px"
            >
              <Text type="m">Create New Project</Text>
            </MenuItem>
            <Divider my={2} />

            <Box>
              {filteredProjects.map((project) => (
                <MenuItem 
                  key={project.id}
                  p={3}
                  h="40px"
                  onClick={() => onToggleProjectSelection(project)}
                >
                  <Flex justify="space-between" align="center" w="full">
                    <Flex align="center" gap={2}>
                      <Checkbox 
                        isChecked={selectedProjects.some(p => p.id === project.id)}
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleProjectSelection(project);
                        }}
                      />
                      <Text type="m">{project.name}</Text>
                    </Flex>
                    <Badge colorScheme="blue" ml={2}>
                      {project.activities.length} docs
                    </Badge>
                  </Flex>
                </MenuItem>
              ))}
            </Box>
          </ScrollableMenuList>
        </Menu>
      </Flex>

      {/* Document list section */}
      <Flex direction="column" w="full">
        <Flex justify="space-between" align="center" mb={3}>
          <Text type="m" bold>
            {selectedProjects.length > 0 
              ? selectedProjects.length === 1 
                ? `${selectedProjects[0].name} Documents` 
                : `${selectedProjects.length} Projects Documents`
              : "All Documents"
            }
          </Text>
          
          <Flex gap={2}>
            {/* Voice note recording button */}
            <Tooltip label={isRecording ? "Stop recording" : "Record a voice note"}>
              <IconButton
                aria-label={isRecording ? "Stop recording" : "Record a voice note"}
                icon={isRecording ? <Square size={16} /> : <Mic size={16} />}
                size="sm"
                variant={isRecording ? "solid" : "ghost"}
                onClick={isRecording ? stopRecording : startRecording}
                colorScheme={isRecording ? "red" : "gray"}
              />
            </Tooltip>
            
            {/* File import button */}
            <Tooltip label="Import document (PDF, DOCX, etc.)">
              <IconButton
                aria-label="Import document"
                icon={<FileUp size={16} />}
                size="sm"
                variant="ghost"
                onClick={handleFileImport}
              />
            </Tooltip>
            
            {/* Button for creating a new document */}
            <Tooltip label="Create a new document">
              <IconButton
                aria-label="Add new document"
                icon={<FilePlus size={16} />}
                size="sm"
                variant="ghost"
                onClick={handleAddNewDocument}
              />
            </Tooltip>
            
            {/* Only show delete button when a project is selected */}
            {selectedProjects.length > 0 && (
              <DeleteProjectButton 
                project={selectedProjects[0]} 
                onDelete={onDeleteProject} 
              />
            )}
          </Flex>
        </Flex>
        
        {/* Display recording info and transcribe button when audioURL is available */}
        {(isRecording || audioURL || isProcessingRecording) && (
          <Box 
            p={3} 
            mb={3} 
            borderRadius="md" 
            borderWidth="1px" 
            borderColor="gray.200"
            bg="gray.50"
            position="relative"
          >
            {/* Add delete button if audio is ready */}
            {audioURL && (
              <Tooltip label="Discard recording">
                <IconButton
                  aria-label="Discard recording"
                  icon={<Trash2 size={14} />}
                  size="xs"
                  variant="ghost"
                  position="absolute"
                  top="6px"
                  right="6px"
                  color="gray.500"
                  _hover={{ color: "red.500", bg: "gray.100" }}
                  onClick={discardRecording}
                />
              </Tooltip>
            )}
            
            <Flex direction="column" gap={2}>
              {isRecording ? (
                <Flex align="center" gap={2}>
                  <Box color="red.500" animation="pulse 1.5s infinite">
                    <Mic size={16} />
                  </Box>
                  <ChakraText color="red.500" fontSize="sm">Recording: {formatTime(recordingTime)}</ChakraText>
                </Flex>
              ) : isProcessingRecording ? (
                <Flex align="center" gap={2} justifyContent="center">
                  <Button
                    isLoading
                    loadingText="Processing recording..."
                    variant="ghost"
                    pointerEvents="none"
                    size="sm"
                  />
                </Flex>
              ) : audioURL && (
                <>
                  <Flex align="center" gap={2}>
                    <Headphones size={16} />
                    <ChakraText fontSize="sm">Voice Note Ready ({formatTime(recordingTime)})</ChakraText>
                  </Flex>
                  <Box>
                    <audio src={audioURL} controls style={{ width: '100%' }} />
                  </Box>
                  <Button 
                    colorScheme="blue"
                    size="sm"
                    isLoading={isTranscribing}
                    loadingText="Transcribing..."
                    onClick={transcribeAudio}
                  >
                    Transcribe Voice Note
                  </Button>
                </>
              )}
            </Flex>
          </Box>
        )}
        
        <SearchContainer mb={3}>
          <InputGroup size="md">
            <InputLeftElement pointerEvents="none">
              <Search size={16} color="var(--chakra-colors-gray-400)" />
            </InputLeftElement>
            <Input
              placeholder="Search documents..."
              value={documentSearchTerm}
              onChange={(e) => setDocumentSearchTerm(e.target.value)}
              autoComplete="off"
              autoCorrect="off"
              spellCheck="false"
              borderRadius="full"
              _focus={{
                boxShadow: "0 0 0 1px var(--chakra-colors-blue-400)",
                borderColor: "blue.400"
              }}
            />
          </InputGroup>
        </SearchContainer>
        
        <DocumentsContainer onPaste={handlePaste} tabIndex={0}>
          <Box>
            {sortedDocuments.length > 0 ? (
              sortedDocuments.map((document) => (
                <Flex
                  key={document.id}
                  p={3}
                  mb={1}
                  borderRadius="md"
                  align="center"
                  justify="space-between"
                  _hover={{ bg: 'gray.50' }}
                  transition="all 0.2s"
                  bg={selectedActivityId === document.id ? 'blue.50' : 'white'}
                  onClick={() => editingActivityId !== document.id && handleDocumentSelect(document)}
                  cursor="pointer"
                  position="relative"
                  minHeight="55px"
                  role="group"
                >
                  <Flex align="center" gap={3} flex={1}>
                    <Box color="gray.500">
                      <File size={16} />
                    </Box>
                    <Box flex={1}>
                      {editingActivityId === document.id ? (
                        <Input
                          value={editingName}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditingName(e.target.value)}
                          onBlur={handleSaveEdit}
                          onKeyDown={handleKeyDown}
                          onClick={(e: React.MouseEvent) => e.stopPropagation()}
                          autoFocus
                          size="sm"
                          variant="unstyled"
                        />
                      ) : (
                        <Box>
                          <DocumentName>
                            {truncateDocumentName(document.name)}
                          </DocumentName>
                          
                          {/* Display project tags */}
                          <Flex wrap="wrap" gap={1} mt={1}>
                            {document.allProjects?.map((project) => (
                              <Tag 
                                size="sm" 
                                key={`${document.id}-${project.id}`}
                                borderRadius="full"
                                variant="outline"
                                colorScheme="blue"
                              >
                                <TagLabel>{project.name}</TagLabel>
                              </Tag>
                            ))}
                          </Flex>
                        </Box>
                      )}
                    </Box>
                  </Flex>
                  
                  {/* Updated menu with project tag management */}
                  {!editingActivityId && (
                    <Menu placement="bottom-end" isLazy>
                      <MenuButton
                        as={IconButton}
                        aria-label="Document options"
                        icon={<MoreHorizontal size={14} />}
                        size="xs"
                        variant="ghost"
                        opacity="0"
                        _groupHover={{ opacity: 1 }}
                        onClick={(e: React.MouseEvent) => e.stopPropagation()}
                        position="absolute"
                        top="2"
                        right="2"
                      />
                      <MenuList minW="200px">
                        <MenuItem
                          icon={<Edit size={14} />}
                          onClick={(e: React.MouseEvent) => {
                            e.stopPropagation();
                            handleStartEdit(document);
                          }}
                        >
                          Rename
                        </MenuItem>
                        
                        {/* Replace nested menu with simple MenuItem that opens modal */}
                        <MenuItem
                          icon={<FolderPlus size={14} />}
                          onClick={(e: React.MouseEvent) => {
                            e.stopPropagation();
                            setCurrentDocument(document);
                            setTagModalOpen(true);
                          }}
                        >
                          Manage Project Tags
                        </MenuItem>
                        
                        <Divider my={1} />
                        <MenuItem
                          icon={<Trash2 size={14} />}
                          onClick={(e: React.MouseEvent) => handleDeleteDocument(e, document)}
                          color="red.500"
                        >
                          Delete
                        </MenuItem>
                      </MenuList>
                    </Menu>
                  )}
                </Flex>
              ))
            ) : (
              <Flex 
                justify="center" 
                align="center" 
                p={8}
                color="gray.500"
                flexDirection="column"
                gap={2}
              >
                <File size={24} />
                <Text type="m">
                  {documentSearchTerm 
                    ? "No matching documents found" 
                    : selectedProjects.length > 0
                      ? "No documents in selected projects" 
                      : "No documents added yet"}
                </Text>
              </Flex>
            )}
          </Box>
        </DocumentsContainer>
      </Flex>
      
      {/* Add Project Tags Modal */}
      <Modal isOpen={tagModalOpen} onClose={() => setTagModalOpen(false)} isCentered>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Manage Project Tags</ModalHeader>
          <ModalCloseButton />
          <ModalBody pb={6}>
            {currentDocument && (
              <>
                <ChakraText fontWeight="bold" fontSize="md" mb={3}>
                  Document: {currentDocument.name}
                </ChakraText>
                <Box maxH="300px" overflowY="auto" pr={2}>
                  {projects.map(project => {
                    const hasTag = currentDocument.allProjects
                      ? currentDocument.allProjects.some(p => p.id === project.id)
                      : documentProjectTags[currentDocument.id]?.includes(project.id) || false;
                    return (
                      <Flex 
                        key={project.id}
                        align="center" 
                        justify="space-between"
                        p={2}
                        borderRadius="md"
                        _hover={{ bg: 'gray.50' }}
                        mb={2}
                      >
                        <Flex align="center" gap={2}>
                          <Checkbox 
                            isChecked={tempTags.has(project.id)}
                            onChange={() => handleTempTagToggle(project.id)}
                          />
                          <Text type="m">{project.name}</Text>
                        </Flex>
                        <Badge colorScheme="blue">
                          {project.activities.length} docs
                        </Badge>
                      </Flex>
                    );
                  })}
                </Box>
              </>
            )}
          </ModalBody>
          <ModalFooter>
            <Button 
              variant="ghost" 
              mr={3} 
              onClick={() => setTagModalOpen(false)}
            >
              Cancel
            </Button>
            <Button 
              colorScheme="blue" 
              onClick={handleSaveProjectTags}
            >
              Save Changes
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Flex>
  );
};