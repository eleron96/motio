import { Dispatch, SetStateAction, useCallback, useState } from 'react';
import { Customer } from '@/features/planner/types/planner';

interface UseCustomerActionsParams {
  canEdit: boolean;
  customers: Customer[];
  selectedCustomerId: string | null;
  setSelectedCustomerId: Dispatch<SetStateAction<string | null>>;
  addCustomer: (data: { name: string }) => Promise<Customer | undefined>;
  updateCustomer: (id: string, updates: Partial<Customer>) => Promise<{ error?: string } | undefined>;
  deleteCustomer: (id: string) => Promise<{ error?: string } | undefined>;
  setMutationError: Dispatch<SetStateAction<string>>;
}

export interface UseCustomerActionsResult {
  newCustomerName: string;
  setNewCustomerName: Dispatch<SetStateAction<string>>;
  createCustomerOpen: boolean;
  setCreateCustomerOpen: Dispatch<SetStateAction<boolean>>;
  editingCustomerId: string | null;
  setEditingCustomerId: Dispatch<SetStateAction<string | null>>;
  editingCustomerName: string;
  setEditingCustomerName: Dispatch<SetStateAction<string>>;
  editingCustomerOriginalName: string;
  renameCustomerOpen: boolean;
  setRenameCustomerOpen: Dispatch<SetStateAction<boolean>>;
  renameCustomerConfirmOpen: boolean;
  setRenameCustomerConfirmOpen: Dispatch<SetStateAction<boolean>>;
  deleteCustomerTarget: Customer | null;
  setDeleteCustomerTarget: Dispatch<SetStateAction<Customer | null>>;
  deleteCustomerOpen: boolean;
  setDeleteCustomerOpen: Dispatch<SetStateAction<boolean>>;
  createCustomerByName: (name: string) => Promise<Customer | null | undefined>;
  handleAddCustomerFromTab: () => Promise<void>;
  startCustomerEdit: (customerId: string, customerName: string) => void;
  cancelCustomerEdit: () => void;
  handleRenameCustomer: () => Promise<void>;
  requestCloseRenameCustomer: () => void;
  requestDeleteCustomer: (customer: Customer) => void;
  handleConfirmDeleteCustomer: () => Promise<void>;
}

export const useCustomerActions = ({
  canEdit,
  customers,
  selectedCustomerId,
  setSelectedCustomerId,
  addCustomer,
  updateCustomer,
  deleteCustomer,
  setMutationError,
}: UseCustomerActionsParams): UseCustomerActionsResult => {
  const [newCustomerName, setNewCustomerName] = useState('');
  const [createCustomerOpen, setCreateCustomerOpen] = useState(false);
  const [editingCustomerId, setEditingCustomerId] = useState<string | null>(null);
  const [editingCustomerName, setEditingCustomerName] = useState('');
  const [editingCustomerOriginalName, setEditingCustomerOriginalName] = useState('');
  const [renameCustomerOpen, setRenameCustomerOpen] = useState(false);
  const [renameCustomerConfirmOpen, setRenameCustomerConfirmOpen] = useState(false);
  const [deleteCustomerTarget, setDeleteCustomerTarget] = useState<Customer | null>(null);
  const [deleteCustomerOpen, setDeleteCustomerOpen] = useState(false);

  const createCustomerByName = useCallback(async (name: string) => {
    const trimmed = name.trim();
    if (!canEdit || !trimmed) return null;
    const normalized = trimmed.toLowerCase();
    const existing = customers.find((customer) => customer.name.trim().toLowerCase() === normalized);
    if (existing) return existing;
    return addCustomer({ name: trimmed });
  }, [addCustomer, canEdit, customers]);

  const handleAddCustomerFromTab = useCallback(async () => {
    if (!newCustomerName.trim()) return;
    const created = await createCustomerByName(newCustomerName);
    if (created) {
      setSelectedCustomerId(created.id);
    }
    setNewCustomerName('');
    setCreateCustomerOpen(false);
  }, [createCustomerByName, newCustomerName, setSelectedCustomerId]);

  const startCustomerEdit = useCallback((customerId: string, customerName: string) => {
    if (!canEdit) return;
    setEditingCustomerId(customerId);
    setEditingCustomerName(customerName);
    setEditingCustomerOriginalName(customerName);
    setRenameCustomerOpen(true);
  }, [canEdit]);

  const cancelCustomerEdit = useCallback(() => {
    setEditingCustomerId(null);
    setEditingCustomerName('');
    setEditingCustomerOriginalName('');
  }, []);

  const commitCustomerEdit = useCallback(async (customerId: string) => {
    if (!canEdit) return;
    const nextName = editingCustomerName.trim();
    if (!nextName) {
      cancelCustomerEdit();
      return;
    }
    setMutationError('');
    const result = await updateCustomer(customerId, { name: nextName });
    if (result?.error) {
      setMutationError(result.error);
      return;
    }
    cancelCustomerEdit();
  }, [canEdit, cancelCustomerEdit, editingCustomerName, setMutationError, updateCustomer]);

  const handleRenameCustomer = useCallback(async () => {
    if (!editingCustomerId) return;
    await commitCustomerEdit(editingCustomerId);
    setRenameCustomerOpen(false);
  }, [commitCustomerEdit, editingCustomerId]);

  const requestCloseRenameCustomer = useCallback(() => {
    if (
      editingCustomerId
      && editingCustomerName.trim()
      && editingCustomerName.trim() !== editingCustomerOriginalName.trim()
    ) {
      setRenameCustomerConfirmOpen(true);
      return;
    }
    setRenameCustomerOpen(false);
    cancelCustomerEdit();
  }, [cancelCustomerEdit, editingCustomerId, editingCustomerName, editingCustomerOriginalName]);

  const requestDeleteCustomer = useCallback((customer: Customer) => {
    if (!canEdit) return;
    setDeleteCustomerTarget(customer);
    setDeleteCustomerOpen(true);
  }, [canEdit]);

  const handleConfirmDeleteCustomer = useCallback(async () => {
    if (!deleteCustomerTarget) return;
    setMutationError('');
    const result = await deleteCustomer(deleteCustomerTarget.id);
    if (result?.error) {
      setMutationError(result.error);
      return;
    }
    if (selectedCustomerId === deleteCustomerTarget.id) {
      setSelectedCustomerId(null);
    }
    setDeleteCustomerOpen(false);
    setDeleteCustomerTarget(null);
  }, [deleteCustomer, deleteCustomerTarget, selectedCustomerId, setMutationError, setSelectedCustomerId]);

  return {
    newCustomerName,
    setNewCustomerName,
    createCustomerOpen,
    setCreateCustomerOpen,
    editingCustomerId,
    setEditingCustomerId,
    editingCustomerName,
    setEditingCustomerName,
    editingCustomerOriginalName,
    renameCustomerOpen,
    setRenameCustomerOpen,
    renameCustomerConfirmOpen,
    setRenameCustomerConfirmOpen,
    deleteCustomerTarget,
    setDeleteCustomerTarget,
    deleteCustomerOpen,
    setDeleteCustomerOpen,
    createCustomerByName,
    handleAddCustomerFromTab,
    startCustomerEdit,
    cancelCustomerEdit,
    handleRenameCustomer,
    requestCloseRenameCustomer,
    requestDeleteCustomer,
    handleConfirmDeleteCustomer,
  };
};
