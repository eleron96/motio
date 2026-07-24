export const ADMIN_ACTIONS = {
  BOOTSTRAP_SYNC: 'bootstrap.sync',
  USERS_LIST: 'users.list',
  USERS_CREATE: 'users.create',
  USERS_UPDATE: 'users.update',
  USERS_RESET_PASSWORD: 'users.resetPassword',
  USERS_DELETE: 'users.delete',
  WORKSPACES_LIST: 'workspaces.list',
  WORKSPACES_UPDATE: 'workspaces.update',
  WORKSPACES_DELETE: 'workspaces.delete',
  SUPER_ADMINS_LIST: 'superAdmins.list',
  SUPER_ADMINS_CREATE: 'superAdmins.create',
  SUPER_ADMINS_DELETE: 'superAdmins.delete',
  SUPER_ADMINS_WHOAMI: 'superAdmins.whoami',
  KEYCLOAK_SYNC: 'keycloak.sync',
  EASTER_EGGS_LIST: 'easterEggs.list',
  EASTER_EGGS_SAVE: 'easterEggs.save',
  EASTER_EGGS_DELETE: 'easterEggs.delete',
  BROADCASTS_AUDIENCE: 'broadcasts.audience',
  BROADCASTS_SEND: 'broadcasts.send',
  BROADCASTS_PROCESS: 'broadcasts.process',
  BROADCASTS_LIST: 'broadcasts.list',
  BROADCASTS_CANCEL: 'broadcasts.cancel',
  BROADCASTS_TICK: 'broadcasts.tick',
} as const;

export const PUSH_ACTIONS = {
  TEST: 'push.test',
  FLUSH: 'push.flush',
  DEADLINES_SCAN: 'push.deadlines.scan',
} as const;

export const INVITE_ACTIONS = {
  CREATE: 'create',
  ACCEPT: 'accept',
  LIST: 'list',
  DECLINE: 'decline',
  LIST_SENT: 'listSent',
  CANCEL: 'cancel',
} as const;

export const INVITE_ROLE_VALUES = ['viewer', 'editor', 'admin'] as const;
