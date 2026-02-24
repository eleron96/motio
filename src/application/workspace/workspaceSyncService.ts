type WorkspaceSyncAdapter = {
  resetWorkspaceState: () => void;
  refreshAssignees: () => Promise<void>;
  refreshMemberGroups: () => Promise<void>;
};

class WorkspaceSyncService {
  private adapter: WorkspaceSyncAdapter | null = null;

  registerAdapter(adapter: WorkspaceSyncAdapter) {
    this.adapter = adapter;
  }

  resetWorkspaceState() {
    this.adapter?.resetWorkspaceState();
  }

  async refreshAssignees() {
    if (!this.adapter) return;
    await this.adapter.refreshAssignees();
  }

  async refreshMemberGroups() {
    if (!this.adapter) return;
    await this.adapter.refreshMemberGroups();
  }
}

export const workspaceSyncService = new WorkspaceSyncService();
