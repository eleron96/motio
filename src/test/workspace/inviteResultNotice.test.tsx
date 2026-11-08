import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

vi.mock('@lingui/macro', () => ({
  t: (strings: TemplateStringsArray, ...values: unknown[]) =>
    strings.reduce((acc, str, index) => acc + str + (values[index] ?? ''), ''),
}));

import { InviteResultNotice } from '@/features/workspace/components/InviteResultNotice';
import { buildInviteLink, toInviteOutcome } from '@/features/workspace/lib/inviteOutcome';

describe('toInviteOutcome', () => {
  it('reads how the invitation went out', () => {
    expect(toInviteOutcome(
      { inviteEmail: 'anna@example.com', delivery: 'in_app', inviteToken: 'tok-1' },
      'Anna@Example.com ',
    )).toEqual({ email: 'anna@example.com', delivery: 'in_app', token: 'tok-1', alreadyMember: false });
  });

  it('treats an answer without delivery as an email that went out', () => {
    expect(toInviteOutcome({ inviteStatus: 'pending' } as never, ' anna@example.com ')).toEqual({
      email: 'anna@example.com',
      delivery: 'email',
      token: null,
      alreadyMember: false,
    });
  });

  it('notices someone who already has access', () => {
    expect(toInviteOutcome({ alreadyMember: true }, 'anna@example.com').alreadyMember).toBe(true);
  });
});

describe('buildInviteLink', () => {
  it('points at the invite page of this site', () => {
    expect(buildInviteLink('https://planner.example.com/', 'tok-1')).toBe('https://planner.example.com/invite/tok-1');
  });
});

describe('InviteResultNotice', () => {
  it('says that no email went out and offers the link', () => {
    const onCopyLink = vi.fn();
    render(
      <InviteResultNotice
        result={{ email: 'anna@example.com', delivery: 'in_app', token: 'tok-1', alreadyMember: false }}
        onCopyLink={onCopyLink}
      />,
    );

    expect(screen.getByText('Invitation created')).toBeInTheDocument();
    expect(screen.getByText(/No email was sent\. anna@example\.com will see the invitation/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));
    expect(onCopyLink).toHaveBeenCalledWith('tok-1');
  });

  it('confirms the email without offering a link', () => {
    render(
      <InviteResultNotice
        result={{ email: 'anna@example.com', delivery: 'email', token: 'tok-1', alreadyMember: false }}
        onCopyLink={vi.fn()}
      />,
    );

    expect(screen.getByText('Invitation sent')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Copy link' })).not.toBeInTheDocument();
  });

  it('says when the person is already in the workspace', () => {
    render(
      <InviteResultNotice
        result={{ email: 'anna@example.com', delivery: 'email', token: null, alreadyMember: true }}
        onCopyLink={vi.fn()}
      />,
    );

    expect(screen.getByText('Already a member')).toBeInTheDocument();
    expect(screen.getByText('anna@example.com already has access to this workspace.')).toBeInTheDocument();
  });
});
