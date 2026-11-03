import React from 'react';
import { t } from '@lingui/macro';
import { ProjectsSidebar } from '@/features/projects/components/ProjectsSidebar';
import { ProjectCardSidebar } from '@/features/projects/components/projectCard/ProjectCardSidebar';
import type { ProjectsLists } from '@/features/projects/hooks/useProjectsLists';
import type { ProjectsViewPreferences } from '@/features/projects/hooks/useProjectsViewPreferences';
import type { Customer, MemberGroup, Milestone, Project } from '@/features/planner/types/planner';
import type { CompanyBucket } from '@/features/projects/lib/contactList';

interface ProjectsDesktopSidebarProps {
  lists: ProjectsLists;
  preferences: ProjectsViewPreferences;
  modeTabs: React.ReactNode;
  canEdit: boolean;
  milestones: Milestone[];
  memberGroups: MemberGroup[];
  selectedMilestoneId: string | null;
  onSelectMilestone: (milestoneId: string) => void;
  contacts: {
    companyBuckets: CompanyBucket[];
    contactSearch: string;
    onContactSearchChange: (value: string) => void;
    selectedCompanyKey: string;
    onSelectCompany: (key: string) => void;
  };
  onOpenProjectSettings: (project: Project) => void;
  onToggleProjectArchived: (project: Project) => void;
  onRequestDeleteProject: (project: Project) => void;
  onToggleTrackedProject: (projectId: string, nextTracked: boolean) => void;
  onStartCustomerEdit: (customerId: string, customerName: string, industry?: string | null) => void;
  onRequestDeleteCustomer: (customer: Customer) => void;
  onOpenMilestoneSettings: (milestone: Milestone) => void;
  onOpenProjectFromMilestone: (milestone: Milestone) => void;
  onRequestDeleteMilestone: (milestone: Milestone) => void;
}

/**
 * The left column of the projects page on desktop: the project cards in the
 * projects mode, the legacy list (customers, milestones, contacts) under the
 * same mode tabs otherwise.
 */
export const ProjectsDesktopSidebar: React.FC<ProjectsDesktopSidebarProps> = ({
  lists,
  preferences,
  modeTabs,
  canEdit,
  milestones,
  memberGroups,
  selectedMilestoneId,
  onSelectMilestone,
  contacts,
  onOpenProjectSettings,
  onToggleProjectArchived,
  onRequestDeleteProject,
  onToggleTrackedProject,
  onStartCustomerEdit,
  onRequestDeleteCustomer,
  onOpenMilestoneSettings,
  onOpenProjectFromMilestone,
  onRequestDeleteMilestone,
}) => {
  const {
    mode,
    setMode,
    tab,
    setTab,
    nameSort,
    setNameSort,
    groupByCustomer,
    setGroupByCustomer,
    milestoneTab,
    setMilestoneTab,
    selectedProjectId,
    setSelectedProjectId,
    selectedCustomerId,
    setSelectedCustomerId,
  } = preferences;

  // 'projects' mode: the card-style project list.
  if (mode === 'projects') {
    const visibleProjects = tab === 'archived'
      ? lists.filteredArchivedProjects
      : lists.filteredActiveProjects;
    const groupLabel = tab === 'archived' ? t`Archived` : t`Active`;
    return (
      <ProjectCardSidebar
        projects={visibleProjects}
        customerById={lists.customerById}
        memberGroupById={lists.memberGroupById}
        milestones={milestones}
        selectedProjectId={selectedProjectId}
        onSelectProject={(projectId) => {
          setSelectedProjectId(projectId);
        }}
        search={lists.projectSearch}
        onSearchChange={lists.setProjectSearch}
        nameSort={nameSort}
        onToggleNameSort={() => setNameSort((current) => (current === 'asc' ? 'desc' : 'asc'))}
        canEdit={canEdit}
        onOpenProjectSettings={onOpenProjectSettings}
        onToggleProjectArchived={onToggleProjectArchived}
        onRequestDeleteProject={onRequestDeleteProject}
        groupLabel={groupLabel}
        sortedCustomers={lists.sortedCustomers}
        customerFilterIds={lists.customerFilterIds}
        customerFilterLabel={lists.customerFilterLabel}
        onToggleCustomerFilter={lists.handleToggleCustomer}
        onClearCustomerFilters={() => lists.setCustomerFilterIds([])}
        groupByCustomer={groupByCustomer}
        onToggleGroupByCustomer={() => setGroupByCustomer((current) => !current)}
        groupedProjects={lists.groupedProjects(visibleProjects)}
        memberGroups={memberGroups}
        ownerGroupFilterIds={lists.ownerGroupFilterIds}
        ownerGroupFilterLabel={lists.ownerGroupFilterLabel}
        onToggleOwnerGroupFilter={lists.handleToggleOwnerGroupFilter}
        onClearOwnerGroupFilters={() => lists.setOwnerGroupFilterIds([])}
        modeTabs={modeTabs}
        showArchived={tab === 'archived'}
        onToggleShowArchived={() => setTab((current) => current === 'archived' ? 'active' : 'archived')}
        trackedProjectIdSet={lists.trackedProjectIdSet}
        onToggleTrackedProject={onToggleTrackedProject}
      />
    );
  }

  // Customers / milestones / contacts: the same mode tabs above the legacy
  // sidebar, so one can still flip between them.
  return (
    <div className="flex h-full flex-col">
      {modeTabs}
      <div className="flex-1 min-h-0">
        <ProjectsSidebar
          mode={mode}
          onModeChange={setMode}
          hideModeSelector
          canEdit={canEdit}
          nameSort={nameSort}
          nameSortLabel={lists.nameSortLabel}
          onToggleNameSort={() => setNameSort((current) => (current === 'asc' ? 'desc' : 'asc'))}
          customerSearch={lists.customerSearch}
          onCustomerSearchChange={lists.setCustomerSearch}
          sortedCustomers={lists.sortedCustomers}
          filteredCustomers={lists.filteredCustomers}
          customerProjectCounts={lists.customerProjectCounts}
          selectedCustomerId={selectedCustomerId}
          onSelectCustomer={(customerId) => {
            setSelectedCustomerId(customerId);
          }}
          onStartCustomerEdit={onStartCustomerEdit}
          onRequestDeleteCustomer={onRequestDeleteCustomer}
          companyBuckets={contacts.companyBuckets}
          contactSearch={contacts.contactSearch}
          onContactSearchChange={contacts.onContactSearchChange}
          selectedCompanyKey={contacts.selectedCompanyKey}
          onSelectCompany={contacts.onSelectCompany}
          milestoneTab={milestoneTab}
          onMilestoneTabChange={setMilestoneTab}
          milestoneSearch={lists.milestoneSearch}
          onMilestoneSearchChange={lists.setMilestoneSearch}
          milestoneGroupLabel={lists.milestoneGroupLabel}
          onCycleMilestoneGroup={lists.handleCycleMilestoneGroup}
          memberGroups={memberGroups}
          milestoneOwnerGroupFilterIds={lists.milestoneOwnerGroupFilterIds}
          onToggleMilestoneOwnerGroupFilter={lists.handleToggleMilestoneOwnerGroupFilter}
          onClearMilestoneOwnerGroupFilters={() => lists.setMilestoneOwnerGroupFilterIds([])}
          milestones={milestones}
          visibleMilestones={lists.visibleMilestones}
          groupedMilestones={lists.groupedMilestones}
          selectedMilestoneId={selectedMilestoneId}
          onSelectMilestone={onSelectMilestone}
          onOpenMilestoneSettings={onOpenMilestoneSettings}
          onOpenProjectFromMilestone={onOpenProjectFromMilestone}
          onRequestDeleteMilestone={onRequestDeleteMilestone}
          projectById={lists.projectById}
          customerById={lists.customerById}
          trackedProjectIdSet={lists.trackedProjectIdSet}
          formatMilestoneDate={lists.formatMilestoneDate}
        />
      </div>
    </div>
  );
};
