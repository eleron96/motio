import React from 'react';
import { Plus } from 'lucide-react';
import { t } from '@lingui/macro';
import { Button } from '@/shared/ui/button';
import { MOBILE_FAB_BUTTON_CLASS } from '@/shared/ui/mobile-fab';
import type { ProjectsMode } from '@/features/projects/hooks/useProjectsViewPreferences';

interface ProjectsPrimaryActionProps {
  mode: ProjectsMode;
  isMobile: boolean;
  canEdit: boolean;
  onNewContact: () => void;
  onNewCustomer: () => void;
  onNewMilestone: () => void;
  onNewProject: () => void;
}

/**
 * The page header's "New …" button for the section that is open. On a phone
 * it is the floating action button. The desktop contacts tab has none — its
 * panel carries its own "Add contact" — so the page does not render this
 * there at all.
 */
export const ProjectsPrimaryAction: React.FC<ProjectsPrimaryActionProps> = ({
  mode,
  isMobile,
  canEdit,
  onNewContact,
  onNewCustomer,
  onNewMilestone,
  onNewProject,
}) => {
  const { label, onClick } = mode === 'contacts'
    ? { label: t`New contact`, onClick: onNewContact }
    : mode === 'customers'
      ? { label: t`New customer`, onClick: onNewCustomer }
      : mode === 'milestones'
        ? { label: t`New milestone`, onClick: onNewMilestone }
        : { label: t`New project`, onClick: onNewProject };
  return (
    <Button
      data-tour="projects-primary-action"
      onClick={onClick}
      size={isMobile ? 'default' : 'sm'}
      className={isMobile ? MOBILE_FAB_BUTTON_CLASS : 'gap-2'}
      disabled={!canEdit}
    >
      <Plus className="h-4 w-4" />
      {label}
    </Button>
  );
};
