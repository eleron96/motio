import React from 'react';
import { t } from '@lingui/macro';
import { cn } from '@/shared/lib/classNames';
import { formatProjectLabel } from '@/shared/lib/projectLabels';
import { MobilePillSubnav } from '@/shared/ui/mobile-pill-subnav';
import { MobileSwipeDeck } from '@/shared/ui/mobile-swipe-deck';
import { MobileScreenShell } from '@/shared/ui/mobile-screen-shell';
import { ProjectsMobileList } from '@/features/projects/components/ProjectsMobileList';
import { MilestonesMobileSection } from '@/features/projects/components/MilestonesMobileSection';
import { CustomersMobileList } from '@/features/projects/components/CustomersMobileList';
import { ProjectsMobileFiltersScreen } from '@/features/projects/components/ProjectsMobileFiltersScreen';
import type { ProjectsLists } from '@/features/projects/hooks/useProjectsLists';
import type { ProjectsMode, ProjectsViewPreferences } from '@/features/projects/hooks/useProjectsViewPreferences';
import type { Customer, MemberGroup, Milestone, Project } from '@/features/planner/types/planner';

/**
 * Phone sections, in the order they are swiped through. The pill strip, the
 * deck and the dots all read this one list, so they cannot disagree about
 * what comes next.
 */
const PROJECT_MOBILE_SECTIONS: Array<{ id: ProjectsMode }> = [
  { id: 'projects' },
  { id: 'milestones' },
  { id: 'customers' },
  { id: 'contacts' },
];

interface ProjectsMobileViewProps {
  lists: ProjectsLists;
  preferences: ProjectsViewPreferences;
  canEdit: boolean;
  projects: Project[];
  milestones: Milestone[];
  memberGroups: MemberGroup[];
  selectedProject: Project | null;
  selectedCustomer: Customer | null;
  projectScreenOpen: boolean;
  onProjectScreenOpenChange: (open: boolean) => void;
  filtersScreenOpen: boolean;
  onFiltersScreenOpenChange: (open: boolean) => void;
  customerScreenOpen: boolean;
  onCustomerScreenOpenChange: (open: boolean) => void;
  /** The contacts section: the same people panel the desktop shows. */
  contactsPanel: React.ReactNode;
  /** The project or customer detail, pushed on top as a second screen. */
  renderMainPanel: () => React.ReactNode;
  onToggleTracked: (projectId: string, nextTracked: boolean) => void;
  onOpenProjectSettings: (project: Project) => void;
  onToggleProjectArchived: (project: Project) => void;
  onRequestDeleteProject: (project: Project) => void;
  onOpenProjectFromMilestone: (milestone: Milestone) => void;
  onOpenMilestoneSettings: (milestone: Milestone) => void;
  onRequestDeleteMilestone: (milestone: Milestone) => void;
}

/**
 * The projects page on a phone: a deck of four lists swiped sideways (with a
 * pill strip above and dots below), and the project, the filters and the
 * customer pushed on top as second-level screens.
 */
export const ProjectsMobileView: React.FC<ProjectsMobileViewProps> = ({
  lists,
  preferences,
  canEdit,
  projects,
  milestones,
  memberGroups,
  selectedProject,
  selectedCustomer,
  projectScreenOpen,
  onProjectScreenOpenChange,
  filtersScreenOpen,
  onFiltersScreenOpenChange,
  customerScreenOpen,
  onCustomerScreenOpenChange,
  contactsPanel,
  renderMainPanel,
  onToggleTracked,
  onOpenProjectSettings,
  onToggleProjectArchived,
  onRequestDeleteProject,
  onOpenProjectFromMilestone,
  onOpenMilestoneSettings,
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
    setSelectedProjectId,
    setSelectedCustomerId,
  } = preferences;
  const mobileSectionIndex = Math.max(
    0,
    PROJECT_MOBILE_SECTIONS.findIndex((section) => section.id === mode),
  );
  // Counted, not just flagged: the button carries the number so you can see how
  // much is narrowing the list without opening the screen.
  const mobileProjectFilterCount = lists.customerFilterIds.length
    + lists.ownerGroupFilterIds.length
    + (tab === 'archived' ? 1 : 0)
    + (groupByCustomer ? 1 : 0);

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {/* The strip scrolls sideways itself, so it has to swallow the
            gesture instead of letting the deck page under the finger. */}
        <div
          data-swipe-ignore
          className="flex shrink-0 items-center gap-1 border-b border-border bg-card pr-1.5"
        >
          <div className="min-w-0 flex-1">
            <MobilePillSubnav
              items={PROJECT_MOBILE_SECTIONS.map((section) => ({
                id: section.id,
                label: section.id === 'projects'
                  ? t`Projects`
                  : section.id === 'milestones'
                    ? t`Milestones`
                    : section.id === 'customers'
                      ? t`Customers`
                      : t`Contacts`,
              }))}
              activeId={PROJECT_MOBILE_SECTIONS[mobileSectionIndex].id}
              onChange={(id) => setMode(id as typeof mode)}
              ariaLabel={t`Project sections`}
            />
          </div>
        </div>

        <MobileSwipeDeck
          index={mobileSectionIndex}
          count={PROJECT_MOBILE_SECTIONS.length}
          onIndexChange={(next) => setMode(PROJECT_MOBILE_SECTIONS[next].id)}
        >
          <div className="flex h-full min-h-0 flex-col overflow-hidden">
            <ProjectsMobileList
              projects={tab === 'archived' ? lists.filteredArchivedProjects : lists.filteredActiveProjects}
              customerById={lists.customerById}
              milestones={milestones}
              trackedProjectIdSet={lists.trackedProjectIdSet}
              canEdit={canEdit}
              search={lists.projectSearch}
              onSearchChange={lists.setProjectSearch}
              activeFilterCount={mobileProjectFilterCount}
              onOpenFilters={() => onFiltersScreenOpenChange(true)}
              onOpenProject={(project) => {
                setMode('projects');
                setSelectedProjectId(project.id);
                onProjectScreenOpenChange(true);
              }}
              onToggleTracked={onToggleTracked}
              onOpenSettings={onOpenProjectSettings}
              onToggleArchived={onToggleProjectArchived}
              onRequestDelete={onRequestDeleteProject}
              showArchived={tab === 'archived'}
            />
          </div>
          <div className="flex h-full min-h-0 flex-col overflow-hidden">
            <MilestonesMobileSection
              milestones={lists.filteredMilestones}
              projectById={lists.projectById}
              customerById={lists.customerById}
              search={lists.milestoneSearch}
              onSearchChange={lists.setMilestoneSearch}
              canEdit={canEdit}
              onOpenProject={onOpenProjectFromMilestone}
              onEditMilestone={onOpenMilestoneSettings}
              onRequestDelete={onRequestDeleteMilestone}
            />
          </div>
          <div className="flex h-full min-h-0 flex-col overflow-hidden">
            <CustomersMobileList
              customers={lists.filteredCustomers}
              search={lists.customerSearch}
              onSearchChange={lists.setCustomerSearch}
              projects={projects}
              onOpenCustomer={(customer) => {
                setMode('customers');
                setSelectedCustomerId(customer.id);
                onCustomerScreenOpenChange(true);
              }}
            />
          </div>
          <div className="flex h-full min-h-0 flex-col overflow-hidden">
            {contactsPanel}
          </div>
        </MobileSwipeDeck>

        <div
          // Safari reports safe-area-inset-bottom as 0 without
          // viewport-fit=cover, so the clearance has to be a real gap.
          className="flex shrink-0 items-center justify-center gap-1.5 border-t border-border bg-card pt-2 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)]"
        >
          {PROJECT_MOBILE_SECTIONS.map((section, index) => (
            <span
              key={section.id}
              aria-hidden="true"
              className={cn(
                'h-1.5 rounded-full transition-all duration-200',
                index === mobileSectionIndex ? 'w-4 bg-foreground' : 'w-1.5 bg-border',
              )}
            />
          ))}
        </div>
      </div>

      {/* Second level: the project itself, with a back arrow and the swipe
          that goes with it. */}
      <MobileScreenShell
        open={projectScreenOpen && mode === 'projects' && Boolean(selectedProject)}
        onOpenChange={onProjectScreenOpenChange}
        title={selectedProject ? formatProjectLabel(selectedProject.name, selectedProject.code) : t`Project`}
        contentClassName="px-0 pt-0"
      >
        {renderMainPanel()}
      </MobileScreenShell>

      <ProjectsMobileFiltersScreen
        open={filtersScreenOpen}
        onOpenChange={onFiltersScreenOpenChange}
        customers={lists.sortedCustomers}
        customerFilterIds={lists.customerFilterIds}
        onToggleCustomer={lists.handleToggleCustomer}
        memberGroups={memberGroups}
        ownerGroupFilterIds={lists.ownerGroupFilterIds}
        onToggleOwnerGroup={lists.handleToggleOwnerGroupFilter}
        groupByCustomer={groupByCustomer}
        onToggleGroupByCustomer={() => setGroupByCustomer((current) => !current)}
        showArchived={tab === 'archived'}
        onToggleShowArchived={() => setTab(tab === 'archived' ? 'active' : 'archived')}
        nameSort={nameSort}
        onToggleNameSort={() => setNameSort(nameSort === 'asc' ? 'desc' : 'asc')}
        onClearAll={() => {
          lists.setCustomerFilterIds([]);
          lists.setOwnerGroupFilterIds([]);
          setGroupByCustomer(false);
          setTab('active');
        }}
      />

      <MobileScreenShell
        open={customerScreenOpen && mode === 'customers' && Boolean(selectedCustomer)}
        onOpenChange={onCustomerScreenOpenChange}
        title={selectedCustomer?.name ?? t`Customer`}
        contentClassName="px-0 pt-0"
      >
        {renderMainPanel()}
      </MobileScreenShell>
    </>
  );
};
