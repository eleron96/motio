import { supabase } from '@/shared/lib/supabaseClient';
import type {
  PlannerGetState,
  PlannerSetState,
  PlannerStore,
} from '@/features/planner/store/plannerStore.contract';
import {
  CustomerContactRow,
  CustomerRow,
  mapCustomerContactRow,
  mapCustomerRow,
} from '@/features/planner/store/plannerStore.helpers';
import { emptyMutationResult } from '@/features/planner/store/plannerStore.mutationHelpers';

// Customers and their contact people.
type CustomerActions = Pick<
  PlannerStore,
  | 'addCustomer'
  | 'updateCustomer'
  | 'deleteCustomer'
  | 'addCustomerContact'
  | 'updateCustomerContact'
  | 'deleteCustomerContact'
>;

export const createCustomerActions = (
  set: PlannerSetState,
  get: PlannerGetState,
): CustomerActions => ({
  addCustomer: async (customer) => {
    const workspaceId = get().workspaceId;
    if (!workspaceId) return null;

    const { data, error } = await supabase
      .from('customers')
      .insert({
        workspace_id: workspaceId,
        name: customer.name,
        industry: customer.industry ?? null,
      })
      .select('*')
      .single();

    if (error || !data) {
      console.error(error);
      return null;
    }

    const mapped = mapCustomerRow(data as CustomerRow);
    set((state) => ({
      customers: [...state.customers, mapped].sort((left, right) => left.name.localeCompare(right.name)),
    }));

    return mapped;
  },

  updateCustomer: async (id, updates) => {
    const workspaceId = get().workspaceId;
    if (!workspaceId) return { error: 'Workspace not selected.' };

    const payload: Record<string, unknown> = {};
    if ('name' in updates) payload.name = updates.name;
    if ('industry' in updates) payload.industry = updates.industry;
    if (Object.keys(payload).length === 0) return emptyMutationResult;

    const { data, error } = await supabase
      .from('customers')
      .update(payload)
      .eq('id', id)
      .eq('workspace_id', workspaceId)
      .select('*')
      .single();

    if (error || !data) {
      console.error(error);
      return { error: error?.message ?? 'Failed to update customer.' };
    }

    const updated = mapCustomerRow(data as CustomerRow);
    set((state) => ({
      customers: state.customers
        .map((customer) => (customer.id === id ? updated : customer))
        .sort((left, right) => left.name.localeCompare(right.name)),
    }));

    return emptyMutationResult;
  },

  deleteCustomer: async (id) => {
    const workspaceId = get().workspaceId;
    if (!workspaceId) return { error: 'Workspace not selected.' };

    const { error } = await supabase
      .from('customers')
      .delete()
      .eq('id', id)
      .eq('workspace_id', workspaceId);

    if (error) {
      console.error(error);
      return { error: error.message };
    }

    set((state) => ({
      customers: state.customers.filter((customer) => customer.id !== id),
      customerContacts: state.customerContacts.filter((contact) => contact.customerId !== id),
      projects: state.projects.map((project) => (
        project.customerId === id ? { ...project, customerId: null } : project
      )),
    }));

    return emptyMutationResult;
  },

  addCustomerContact: async (contact) => {
    const workspaceId = get().workspaceId;
    if (!workspaceId) return null;

    // Append at the end of the per-customer list.
    const existingForCustomer = get().customerContacts.filter((c) => c.customerId === contact.customerId);
    const nextPosition = existingForCustomer.reduce((max, c) => Math.max(max, c.position + 1), 0);

    const { data, error } = await supabase
      .from('customer_contacts')
      .insert({
        workspace_id: workspaceId,
        customer_id: contact.customerId,
        name: contact.name,
        role: contact.role,
        email: contact.email,
        phone: contact.phone,
        position: nextPosition,
        company: contact.company ?? null,
        tag: contact.tag ?? null,
      })
      .select('*')
      .single();

    if (error || !data) {
      console.error(error);
      return null;
    }

    const mapped = mapCustomerContactRow(data as CustomerContactRow);
    set((state) => ({ customerContacts: [...state.customerContacts, mapped] }));
    return mapped;
  },

  updateCustomerContact: async (id, updates) => {
    const workspaceId = get().workspaceId;
    if (!workspaceId) return { error: 'Workspace not selected.' };

    const payload: Record<string, unknown> = {};
    if ('name' in updates) payload.name = updates.name;
    if ('role' in updates) payload.role = updates.role;
    if ('email' in updates) payload.email = updates.email;
    if ('phone' in updates) payload.phone = updates.phone;
    if ('position' in updates) payload.position = updates.position;
    if ('company' in updates) payload.company = updates.company;
    if ('tag' in updates) payload.tag = updates.tag;
    // Attach/detach/move between clients from the Contacts tab (null = standalone).
    if ('customerId' in updates) payload.customer_id = updates.customerId;
    if (Object.keys(payload).length === 0) return emptyMutationResult;

    const { data, error } = await supabase
      .from('customer_contacts')
      .update(payload)
      .eq('id', id)
      .eq('workspace_id', workspaceId)
      .select('*')
      .single();

    if (error || !data) {
      console.error(error);
      return { error: error?.message ?? 'Failed to update contact.' };
    }

    const updated = mapCustomerContactRow(data as CustomerContactRow);
    set((state) => ({
      customerContacts: state.customerContacts.map((c) => (c.id === id ? updated : c)),
    }));
    return emptyMutationResult;
  },

  deleteCustomerContact: async (id) => {
    const workspaceId = get().workspaceId;
    if (!workspaceId) return { error: 'Workspace not selected.' };

    const { error } = await supabase
      .from('customer_contacts')
      .delete()
      .eq('id', id)
      .eq('workspace_id', workspaceId);

    if (error) {
      console.error(error);
      return { error: error.message };
    }

    set((state) => ({
      customerContacts: state.customerContacts.filter((c) => c.id !== id),
    }));
    return emptyMutationResult;
  },
});
