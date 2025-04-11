import { type FC, useMemo } from "react";
import { Badge, Flex, IconButton, Tooltip } from "@chakra-ui/react";
import { useProject } from "../state";
import { Folders, X } from 'lucide-react'; // Changed from FaBookOpen

export const ProjectBadge: FC = () => {
  const { state, getSelectedProjects, selectProjects } = useProject();
  const selectedProjects = useMemo(() => getSelectedProjects(), [state]);

  if (!selectedProjects.length) {
    return null;
  }

  // If there's just one project, show it normally
  if (selectedProjects.length === 1) {
    return (
      <Flex
        style={{
          border: "1px solid var(--default-border-color)",
          borderRadius: "8px",
          padding: "2px 8px",
          gap: "8px",
          alignItems: "center",
          position: "relative", // Added for positioning the X button
        }}
      >
        <Folders size={16} /> {/* Changed from FaBookOpen, added size */}
        <span>{selectedProjects[0].name}</span>
        <IconButton
          aria-label="Unselect project"
          icon={<X size={14} />}
          size="xs"
          variant="ghost"
          onClick={() => selectProjects([])}
          ml={1}
          _hover={{ bg: 'gray-100' }}
        />
      </Flex>
    );
  }

  // If there are multiple projects, show a count with the projects in a tooltip
  return (
    <Tooltip 
      label={selectedProjects.map(p => p.name).join(", ")}
      placement="top"
      hasArrow
    >
      <Flex
        style={{
          border: "1px solid var(--default-border-color)",
          borderRadius: "8px",
          padding: "2px 8px",
          gap: "8px",
          alignItems: "center",
          position: "relative",
        }}
      >
        <Folders size={16} />
        <span>Multiple Projects</span>
        <Badge colorScheme="blue" borderRadius="full" ml={1}>
          {selectedProjects.length}
        </Badge>
        <IconButton
          aria-label="Unselect projects"
          icon={<X size={14} />}
          size="xs"
          variant="ghost"
          onClick={() => selectProjects([])}
          ml={1}
          _hover={{ bg: 'gray-100' }}
        />
      </Flex>
    </Tooltip>
  );
};