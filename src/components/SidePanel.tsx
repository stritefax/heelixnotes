import { ReactNode, type FC, type CSSProperties } from "react";
import { FaHistory } from "react-icons/fa";
import styled from "styled-components";
import { Tabs, TabList, TabPanels, Tab, TabPanel, useColorModeValue } from "@chakra-ui/react";

// const Container = styled.div<{ gridArea: CSSProperties["gridArea"] }>`
//   grid-area: ${({ gridArea }) => gridArea};
// `;

const TabHeaderContent = styled.div`
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
  color: var(--text-default-color);
`;

const StyledTab = styled(Tab)`
  color: var(--text-default-color);
  
  &[aria-selected=true] {
    background-color: #EBF8FF !important; /* Original blue.50 color */
    color: #3182CE !important; /* Original blue.600 color */
    font-weight: bold;
  }
  
  &:hover {
    background-color: #EDF2F7 !important; /* Original gray.100 color */
  }

  /* Apply dark mode colors when dark mode is active */
  [data-theme="dark"] & {
    &[aria-selected=true] {
      background-color: #2d395a !important;
      color: #4d7bbd !important;
    }
    
    &:hover {
      background-color: #334155 !important;
    }
  }
`;

const StyledTabPanel = styled(TabPanel)`
  padding: 0 !important;
  background-color: var(--card-content-background);
`;

type SidePanelProps = {
  gridArea: CSSProperties["gridArea"];
  pages: { text?: string; icon: ReactNode; content: ReactNode }[];
};

export const SidePanel: FC<SidePanelProps> = ({ pages, gridArea }) => {
  return (
    <Tabs 
      variant={"soft-rounded"} 
      style={{ 
        gridArea, 
        height: "100%",
        backgroundColor: "var(--card-content-background)" 
      }}
      colorScheme="blue"
    >
      <TabList style={{ 
        padding: "12px", 
        backgroundColor: "var(--card-content-background)",
        borderBottom: "1px solid var(--default-border-color)"
      }}>
        {pages.map((page) => (
          <StyledTab key={page.text}>
            <TabHeaderContent>
              {page.icon}
              {page.text}
            </TabHeaderContent>
          </StyledTab>
        ))}
      </TabList>
      <TabPanels style={{ backgroundColor: "var(--card-content-background)" }}>
        {pages.map((page) => (
          <StyledTabPanel key={page.text}>{page.content}</StyledTabPanel>
        ))}
      </TabPanels>
    </Tabs>
  );
};
