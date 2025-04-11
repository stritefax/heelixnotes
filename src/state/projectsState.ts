import { useAtom } from "jotai";
import { atomWithReducer } from "jotai/utils";
import { useEffect } from "react";
import { projectService, type Project, UNASSIGNED_PROJECT_NAME } from "../data/project";
import { getFullActivityText } from "../data/activities";

type ProjectState = {
  projects: Project[];
  selectedProjects: Project["id"][];
  selectedActivityId: number | null;
};

type ProjectAction =
  | { type: "set"; payload: Project[] }
  | { type: "selectProjects"; payload: Project["id"][] }
  | { type: "toggleProjectSelection"; payload: Project["id"] }
  | { type: "update"; payload: Project }
  | { type: "delete"; payload: Project["id"] }
  | { type: "selectActivity"; payload: number | null }
  | { type: "updateActivityName"; payload: { projectId: number; activityId: number; name: string } }
  | { type: "addActivity"; payload: { projectId: number; activityId: number } }
  | { type: "deleteActivity"; payload: { projectId: number; activityId: number } };

// Reducer
const projectReducer = (prev: ProjectState, action: ProjectAction): ProjectState => {
  switch (action.type) {
    case "set":
      return {
        ...prev,
        projects: action.payload,
      };

    case "selectProjects":
      return {
        ...prev,
        selectedProjects: action.payload,
      };
      
    case "toggleProjectSelection":
      const isAlreadySelected = prev.selectedProjects.includes(action.payload);
      return {
        ...prev,
        selectedProjects: isAlreadySelected
          ? prev.selectedProjects.filter(id => id !== action.payload)
          : [...prev.selectedProjects, action.payload],
      };

    case "update":
      const projectIndex = prev.projects.findIndex(
        (project) => project.id === action.payload.id
      );
      if (projectIndex >= 0) {
        prev.projects[projectIndex] = action.payload;
      }
      return { ...prev };
      
    case "delete":
      const projectDeleteIndex = prev.projects.findIndex(
        (project) => project.id === action.payload
      );
      if (projectDeleteIndex >= 0) {
        prev.projects.splice(projectDeleteIndex, 1);
      }
      return {
        ...prev,
        selectedProjects: prev.selectedProjects.filter(id => id !== action.payload),
      };
      
    case "selectActivity":
      return {
        ...prev,
        selectedActivityId: action.payload,
      };

    case "updateActivityName":
      return {
        ...prev,
        projects: prev.projects.map(project =>
          project.id === action.payload.projectId
            ? {
                ...project,
                activity_names: project.activity_names.map((name, idx) =>
                  project.activities[idx] === action.payload.activityId
                    ? action.payload.name
                    : name
                ),
              }
            : project
        ),
      };

    case "addActivity":
      return {
        ...prev,
        projects: prev.projects.map(project =>
          project.id === action.payload.projectId
            ? {
                ...project,
                activities: [...project.activities, action.payload.activityId],
                activity_ids: [...project.activity_ids, action.payload.activityId],
                activity_names: [...project.activity_names, "New Document"]
              }
            : project
        ),
      };
      
    case "deleteActivity":
      return {
        ...prev,
        projects: prev.projects.map(project => {
          if (project.id === action.payload.projectId) {
            const activityIndex = project.activities.findIndex(id => id === action.payload.activityId);
            
            if (activityIndex >= 0) {
              const newProject = {...project};
              newProject.activities.splice(activityIndex, 1);
              newProject.activity_ids.splice(activityIndex, 1);
              newProject.activity_names.splice(activityIndex, 1);
              return newProject;
            }
          }
          return project;
        }),
        selectedActivityId: prev.selectedActivityId === action.payload.activityId 
          ? null 
          : prev.selectedActivityId
      };

    default:
      return prev;
  }
};

// Initial state
const initialState: ProjectState = {
  projects: [],
  selectedProjects: [],
  selectedActivityId: null,
};

// Atom
export const projectAtom = atomWithReducer<ProjectState, ProjectAction>(
  initialState,
  projectReducer
);

export const useProject = () => {
  const [state, dispatch] = useAtom(projectAtom);

  const fetch = () => {
    projectService.fetch(0).then((result) => {
      dispatch({ type: "set", payload: result });
    });
  };

  useEffect(() => {
    fetch();
  }, []);

  const addProject = async (project: Omit<Project, "id">) => {
    await projectService.save(project);
    fetch();
  };

  const updateProject = async (project: Project) => {
    await projectService.update(project);
    fetch();
  };

  const deleteProject = async (projectId: Project["id"]) => {
    await projectService.delete(projectId);
    fetch();
  };

  const selectProjects = (projectIds: Project["id"][]) =>
    dispatch({ type: "selectProjects", payload: projectIds });
    
  const toggleProjectSelection = (projectId: Project["id"]) =>
    dispatch({ type: "toggleProjectSelection", payload: projectId });

  const getSelectedProjects = () => {
    return state.projects.filter((project) => 
      state.selectedProjects.includes(project.id)
    );
  };
  
  const tagDocumentWithProject = async (activityId: number, projectId: number) => {
    try {
      await projectService.tagDocumentWithProject(activityId, projectId);
      await fetch();
      return true;
    } catch (error) {
      console.error("Error tagging document with project:", error);
      return false;
    }
  };
  
  const untagDocumentFromProject = async (activityId: number, projectId: number) => {
    try {
      await projectService.untagDocumentFromProject(activityId, projectId);
      await fetch();
      return true;
    } catch (error) {
      console.error("Error untagging document from project:", error);
      return false;
    }
  };
  
  const getDocumentProjects = async (activityId: number) => {
    try {
      return await projectService.getDocumentProjects(activityId);
    } catch (error) {
      console.error("Error getting document projects:", error);
      return [];
    }
  };

  const getSelectedProjectsActivityText = async () => {
    const selectedProjects = getSelectedProjects();
    if (selectedProjects.length > 0) {
      const allActivities: number[] = [];
      
      selectedProjects.forEach(project => {
        project.activities.forEach(activityId => {
          if (!allActivities.includes(activityId)) {
            allActivities.push(activityId);
          }
        });
      });
      
      const promises = allActivities.map(activityId =>
        getFullActivityText(activityId)
      );
      
      const fullTextActivities = await Promise.all(promises);
      return fullTextActivities
        .map((text, index) => `${index + 1}. Activity: \n ${text}`)
        .join(", ");
    }
    return "";
  };

  const selectActivity = (activityId: number | null) =>
    dispatch({ type: "selectActivity", payload: activityId });

  // Find which project contains a specific activity
  const findProjectWithActivity = (activityId: number): Project | undefined => {
    return state.projects.find(project => 
      project.activities.includes(activityId)
    );
  };

  // Get activity name by ID regardless of project
  const getActivityName = (activityId: number): string => {
    for (const project of state.projects) {
      const activityIndex = project.activities.indexOf(activityId);
      if (activityIndex !== -1) {
        return project.activity_names[activityIndex] || "Untitled Document";
      }
    }
    return "Untitled Document";
  };

  const updateActivityName = async (activityId: number, name: string) => {
    // Find which project contains this activity
    const selectedProject = getSelectedProject();
    const projectWithActivity = selectedProject || findProjectWithActivity(activityId);
    
    if (projectWithActivity) {
      await projectService.updateActivityName(activityId, name);
      dispatch({
        type: "updateActivityName",
        payload: { projectId: projectWithActivity.id, activityId, name },
      });
    }
  };

  const updateActivityContent = async (activityId: number, content: string) => {
    try {
      // Call the backend service to update the activity content
      await projectService.updateActivityContent(activityId, content);
      return true;
    } catch (error) {
      console.error("Error updating activity content:", error);
      return false;
    }
  };

  const addBlankActivity = async () => {
    const selectedProject = getSelectedProject();
    if (selectedProject) {
      const newActivityId = await projectService.addBlankActivity(selectedProject.id);
      dispatch({
        type: "addActivity",
        payload: { projectId: selectedProject.id, activityId: newActivityId }
      });
      return newActivityId;
    }
    return undefined;
  };
  
  const addUnassignedActivity = async () => {
    try {
      const newActivityId = await projectService.addUnassignedActivity();
      // Refresh project list to ensure we have the updated data
      await fetch();
      return newActivityId;
    } catch (error) {
      console.error("Error adding unassigned activity:", error);
      return undefined;
    }
  };
  
  const deleteActivity = async (activityId: number) => {
    // Find which project contains this activity
    const projectWithActivity = findProjectWithActivity(activityId);
    
    if (projectWithActivity) {
      await projectService.deleteActivity(activityId);
      dispatch({
        type: "deleteActivity",
        payload: { projectId: projectWithActivity.id, activityId }
      });
    }
  };

  const getSelectedProject = () => {
    return state.projects.find((project) => project.id === state.selectedProjects[0]);
  };
  
  // Get visible projects (excluding unassigned project)
  const getVisibleProjects = () => {
    return state.projects.filter(project => project.name !== UNASSIGNED_PROJECT_NAME);
  };

  // Get the project that a specific activity belongs to
  const getActivityProject = (activityId: number) => {
    return state.projects.find(project => 
      project.activities.includes(activityId)
    );
  };

  const fetchSelectedActivityText = async () => {
    if (state.selectedActivityId) {
      const projectWithActivity = getActivityProject(state.selectedActivityId);
      if (projectWithActivity) {
        return getFullActivityText(state.selectedActivityId);
      }
    }
    return "";
  };

  // Add the moveActivity function
  const moveActivity = async (activityId: number, targetProjectId: number) => {
    try {
      // Find which project contains this activity
      const sourceProject = findProjectWithActivity(activityId);
      
      if (!sourceProject) {
        console.error("Source project not found for activity", activityId);
        return false;
      }
      
      // Call the backend service to update the project assignment
      await projectService.tagDocumentWithProject(activityId, targetProjectId);
      
      // Refresh the projects to update the local state
      await fetch();
      
      return true;
    } catch (error) {
      console.error("Error moving activity to new project:", error);
      return false;
    }
  };

  return {
    state,
    getSelectedProjects,
    getActivityProject,
    getVisibleProjects,
    getActivityName,
    getSelectedProjectsActivityText,
    fetchSelectedActivityText,
    selectProjects,
    toggleProjectSelection,
    selectActivity,
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
    updateActivityContent,
    moveActivity
  };
};