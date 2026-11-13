import React, { useEffect, useRef, useState } from 'react';
import { useAuthStore } from '@/features/auth/store/authStore';
import { useDashboardStore } from '@/features/dashboard/store/dashboardStore';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { isWorkspaceApiEnabled } from '@/shared/lib/featureFlags';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/shared/ui/alert-dialog';
import {
  Settings2,
  Building2,
  Eye,
  Users,
  Workflow,
  LayoutTemplate,
  AlertTriangle,
  KeyRound,
} from 'lucide-react';
import { t } from '@lingui/macro';
import { cn } from '@/shared/lib/classNames';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { MobileStackScreen, type MobileStackSection } from '@/shared/ui/mobile-stack-screen';
import { useMobileMenu } from '@/shared/components/MobileMenuContext';
import { Block } from '@/features/workspace/components/settingsBlocks';
import { WorkspaceTemplateSettings } from '@/features/workspace/components/WorkspaceTemplateSettings';
import { WorkspaceMembersSection } from '@/features/workspace/components/WorkspaceMembersSection';
import { WorkspaceApiTokensSection } from '@/features/workspace/components/WorkspaceApiTokensSection';
import { WorkspaceWorkflowSettings } from '@/features/workspace/components/WorkspaceWorkflowSettings';
import { WorkspaceDisplaySettings } from '@/features/workspace/components/WorkspaceDisplaySettings';
import { WorkspaceGeneralSettings } from '@/features/workspace/components/WorkspaceGeneralSettings';
import { useWorkspaceGeneralDraft } from '@/features/workspace/hooks/useWorkspaceGeneralDraft';
import { useShallow } from 'zustand/react/shallow';

interface SettingsPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}


type SectionId = 'general' | 'display' | 'people' | 'workflow' | 'template' | 'api' | 'danger';

export const SettingsPanel: React.FC<SettingsPanelProps> = ({ open, onOpenChange }) => {

  const {
    user,
    workspaces,
    members,
    fetchMembers,
    currentWorkspaceId,
    currentWorkspaceRole,
    deleteWorkspace,
    transferWorkspaceOwnership,
  } = useAuthStore(useShallow((state) => ({
    user: state.user,
    workspaces: state.workspaces,
    members: state.members,
    fetchMembers: state.fetchMembers,
    currentWorkspaceId: state.currentWorkspaceId,
    currentWorkspaceRole: state.currentWorkspaceRole,
    deleteWorkspace: state.deleteWorkspace,
    transferWorkspaceOwnership: state.transferWorkspaceOwnership,
  })));

  const isMobile = useIsMobile();

  // Unsaved capacity draft: kept here so it survives switching sections and is
  // reset with the rest of the form whenever the panel opens.
  const [heatmapCapacityInput, setHeatmapCapacityInput] = useState('');

  const currentWorkspace = workspaces.find((workspace) => workspace.id === currentWorkspaceId);
  const isAdmin = currentWorkspaceRole === 'admin';

  // Правка справочника меняет только planner-стор, а у дашборда свой кэш имён
  // и цифр. Настройки — диалог поверх страницы, дашборд не перемонтируется и
  // сам о правке не узнает, поэтому сообщаем ему об этом при закрытии: во
  // время редактирования дёргать нельзя — updateStatus летит на каждую букву.
  const catalogTouched = useRef(false);
  const refreshDashboardAfterCatalogChange = useDashboardStore(
    (state) => state.refreshAfterCatalogChange,
  );

  useEffect(() => {
    if (open || !catalogTouched.current) return;
    catalogTouched.current = false;
    if (!currentWorkspaceId) return;
    void refreshDashboardAfterCatalogChange(currentWorkspaceId);
  }, [open, currentWorkspaceId, refreshDashboardAfterCatalogChange]);

  const markCatalogTouched = () => {
    catalogTouched.current = true;
  };
  const isWorkspaceOwner = Boolean(user?.id && currentWorkspace?.ownerId === user.id);
  const transferCandidates = (members ?? []).filter(
    (member) => member.userId !== user?.id && member.status === 'ACTIVE',
  );

  const [activeSection, setActiveSection] = useState<SectionId>('general');
  // On mobile the panel is a full-screen stack whose sections are swipeable, so
  // going "back" hands control to the menu sheet it was opened from.
  const { openMenu } = useMobileMenu();

  const general = useWorkspaceGeneralDraft(open, currentWorkspace, currentWorkspaceId);
  const { resetFromWorkspace, setWorkspaceError } = general;
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferTargetId, setTransferTargetId] = useState('');
  const [transferring, setTransferring] = useState(false);
  const [transferError, setTransferError] = useState('');
  const [deleteConfirmValue, setDeleteConfirmValue] = useState('');


  useEffect(() => {
    if (!open) return;
    setActiveSection('general');
    resetFromWorkspace();
    setHeatmapCapacityInput(
      currentWorkspace?.heatmapCapacityPerPerson != null
        ? String(currentWorkspace.heatmapCapacityPerPerson)
        : '',
    );
    setDeleteConfirmValue('');
  }, [
    open,
    resetFromWorkspace,
    currentWorkspace?.name,
    currentWorkspace?.holidayCountry,
    currentWorkspace?.holidayRegion,
    currentWorkspace?.heatmapCapacityPerPerson,
  ]);

  const deleteConfirmName = currentWorkspace?.name ?? '';
  const canDeleteWorkspace = Boolean(
    isAdmin
      && currentWorkspaceId
      && deleteConfirmName
      && deleteConfirmValue.trim() === deleteConfirmName,
  );

  const handleDeleteWorkspace = async () => {
    if (!currentWorkspaceId) {
      setWorkspaceError(t`Workspace not selected.`);
      return;
    }
    setWorkspaceError('');
    const result = await deleteWorkspace(currentWorkspaceId);
    if (result.error) {
      setWorkspaceError(result.error);
      return;
    }
    setDeleteOpen(false);
  };

  const sections: Array<{ id: SectionId; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'general', label: t`General`, icon: Building2 },
    { id: 'display', label: t`Display`, icon: Eye },
    { id: 'people', label: t`Members and access`, icon: Users },
    { id: 'workflow', label: t`Workflow`, icon: Workflow },
    { id: 'template', label: t`Template`, icon: LayoutTemplate },
    // Workspace API tokens: admins only, behind VITE_FEATURE_WORKSPACE_API.
    ...(isAdmin && isWorkspaceApiEnabled()
      ? [{ id: 'api' as const, label: t`API`, icon: KeyRound }]
      : []),
    { id: 'danger', label: t`Danger zone`, icon: AlertTriangle },
  ];

  const generalContent = (
    <WorkspaceGeneralSettings
      draft={general}
      isAdmin={isAdmin}
      currentWorkspaceId={currentWorkspaceId}
    />
  );

  const displayContent = (
    <WorkspaceDisplaySettings
      isAdmin={isAdmin}
      isMobile={isMobile}
      heatmapCapacityInput={heatmapCapacityInput}
      setHeatmapCapacityInput={setHeatmapCapacityInput}
    />
  );

  const peopleContent = <WorkspaceMembersSection />;

  const workflowContent = <WorkspaceWorkflowSettings onCatalogChange={markCatalogTouched} />;

  const templateContent = <WorkspaceTemplateSettings />;

  const openTransferDialog = () => {
    setTransferError('');
    setTransferTargetId('');
    if (currentWorkspaceId) void fetchMembers(currentWorkspaceId);
    setTransferOpen(true);
  };

  const handleTransferOwnership = async () => {
    if (!currentWorkspaceId || !transferTargetId) return;
    setTransferring(true);
    setTransferError('');
    const result = await transferWorkspaceOwnership(currentWorkspaceId, transferTargetId);
    setTransferring(false);
    if (result.error) {
      setTransferError(result.error);
      return;
    }
    setTransferOpen(false);
  };

  const dangerContent = (
    <div className="space-y-5">
      {isWorkspaceOwner && (
        <Block
          title={t`Ownership`}
          description={t`Transfer ownership of this workspace to another member. You keep your access but stop being the owner.`}
        >
          <Button variant="outline" onClick={openTransferDialog} disabled={!currentWorkspaceId}>
            {t`Transfer ownership`}
          </Button>
        </Block>
      )}
      <Block
        title={t`Danger zone`}
        description={t`Deleting a workspace is permanent. Type the workspace name to enable deletion.`}
      >
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="delete-workspace-confirm">{t`Workspace name`}</Label>
            <Input
              id="delete-workspace-confirm"
              placeholder={deleteConfirmName || t`Workspace name`}
              value={deleteConfirmValue}
              onChange={(event) => setDeleteConfirmValue(event.target.value)}
              disabled={!isAdmin || !currentWorkspaceId}
            />
          </div>
          <Button
            variant="destructive"
            onClick={() => setDeleteOpen(true)}
            disabled={!canDeleteWorkspace}
          >
            {t`Delete workspace`}
          </Button>
        </div>
      </Block>
    </div>
  );

  const sectionContent: Record<SectionId, React.ReactNode> = {
    general: generalContent,
    display: displayContent,
    people: peopleContent,
    workflow: workflowContent,
    template: templateContent,
    api: isAdmin && isWorkspaceApiEnabled()
      ? <WorkspaceApiTokensSection workspaceId={currentWorkspaceId} />
      : null,
    danger: dangerContent,
  };

  const activeLabel = sections.find((section) => section.id === activeSection)?.label ?? '';

  const renderNav = () => (
    <nav className="flex flex-col gap-1">
      {sections.map((section) => {
        const Icon = section.icon;
        const active = section.id === activeSection;
        const danger = section.id === 'danger';
        return (
          <button
            key={section.id}
            type="button"
            onClick={() => setActiveSection(section.id)}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm transition-colors',
              active
                ? 'bg-muted font-medium text-foreground'
                : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
              danger && (active ? 'text-destructive' : 'hover:text-destructive'),
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="flex-1 truncate">{section.label}</span>
          </button>
        );
      })}
    </nav>
  );

  const mobileSections: MobileStackSection[] = sections.map((section) => ({
    id: section.id,
    label: section.label,
    tone: section.id === 'danger' ? 'danger' : undefined,
    content: sectionContent[section.id],
  }));

  const handleMobileBack = () => {
    onOpenChange(false);
    openMenu();
  };

  return (
    <>
      {isMobile ? (
        <MobileStackScreen
          open={open}
          onOpenChange={onOpenChange}
          title={t`Workspace settings`}
          description={t`Choose how your workspace looks and behaves`}
          onBack={handleMobileBack}
          sections={mobileSections}
          activeId={activeSection}
          onActiveChange={(id) => setActiveSection(id as SectionId)}
        />
      ) : (
      <Dialog open={open} onOpenChange={onOpenChange}>
        {/* Wide enough for the member rows (role, group, status and actions all
            sit on one line) without the settings forms looking stranded. */}
        <DialogContent className="max-w-[1120px] w-[92vw] sm:w-[840px] md:w-[980px] lg:w-[1120px] h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="w-5 h-5" />
              {t`Workspace settings`}
            </DialogTitle>
            <DialogDescription>
              {t`Choose how your workspace looks and behaves`}
            </DialogDescription>
          </DialogHeader>

          <div className="mt-2 grid flex-1 min-h-0 grid-cols-[200px_1fr] gap-6">
            <div className="border-r border-border pr-3">
              {renderNav()}
            </div>
            <div className="min-w-0 overflow-y-auto pr-1">
              <h2 className={cn('mb-4 text-base font-semibold', activeSection === 'danger' && 'text-destructive')}>
                {activeLabel}
              </h2>
              {sectionContent[activeSection]}
            </div>
          </div>
        </DialogContent>
      </Dialog>
      )}

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t`Delete workspace?`}</AlertDialogTitle>
            <AlertDialogDescription>
              {t`This will permanently delete "${currentWorkspace?.name ?? t`this workspace`}" and all its data.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t`Cancel`}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteWorkspace}>{t`Delete`}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={transferOpen}
        onOpenChange={(next) => {
          if (transferring) return;
          setTransferOpen(next);
          if (!next) setTransferError('');
        }}
      >
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>{t`Transfer ownership`}</DialogTitle>
            <DialogDescription>
              {t`The selected member becomes the workspace owner. You will no longer be the owner, but you stay as an admin.`}
            </DialogDescription>
          </DialogHeader>
          {transferCandidates.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t`There are no other active members to transfer ownership to.`}
            </p>
          ) : (
            <div className="space-y-2">
              <Label>{t`New owner`}</Label>
              <Select value={transferTargetId} onValueChange={setTransferTargetId}>
                <SelectTrigger>
                  <SelectValue placeholder={t`Select a member`} />
                </SelectTrigger>
                <SelectContent>
                  {transferCandidates.map((candidate) => (
                    <SelectItem key={candidate.userId} value={candidate.userId}>
                      {candidate.displayName || candidate.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {transferError && <p className="text-sm text-destructive">{transferError}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferOpen(false)} disabled={transferring}>
              {t`Cancel`}
            </Button>
            <Button
              onClick={() => void handleTransferOwnership()}
              disabled={transferring || !transferTargetId || transferCandidates.length === 0}
            >
              {t`Transfer ownership`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
