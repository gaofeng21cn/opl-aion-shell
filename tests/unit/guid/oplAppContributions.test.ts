import { describe, expect, it } from 'vitest';
import {
  getOplPackageAppContributionsFromAppState,
  parseOplAppContributions,
} from '@/renderer/pages/guid/utils/oplAppContributions';
import { resolveOplHomeAppContributions } from '@/renderer/pages/guid/utils/oplHomeAssistants';
import { getOplHomeAppNavigationFromAppState } from '@/renderer/pages/guid/utils/oplHomeShortcutPreferences';

const contributions = () => ({
  schema_version: 'opl-app-contributions.v1',
  navigation: [
    {
      navigation_id: 'relay.inbox',
      label_i18n: { 'zh-CN': '收件箱', 'en-US': 'Inbox' },
      view_id: 'relay.inbox',
      icon_id: 'mail',
      sort_order: 10,
    },
  ],
  views: [
    {
      view_id: 'relay.inbox',
      view_type: 'list_detail',
      title_i18n: { 'zh-CN': '收件箱', 'en-US': 'Inbox' },
      data_ref: 'communications.mail.inbox.v1',
      command_ids: ['relay.create_draft'],
      badge_ids: ['relay.unread'],
      empty_state_i18n: { 'zh-CN': '暂无邮件', 'en-US': 'No messages' },
    },
  ],
  commands: [
    {
      command_id: 'relay.create_draft',
      label_i18n: { 'zh-CN': '创建草稿', 'en-US': 'Create draft' },
      action_ref: 'communications.mail.create_draft.v1',
      confirmation_required: false,
    },
  ],
  badges: [
    {
      badge_id: 'relay.unread',
      label_i18n: { 'zh-CN': '未读', 'en-US': 'Unread' },
      data_ref: 'communications.mail.unread_count.v1',
      tone: 'info',
    },
  ],
});

describe('OPL App contributions', () => {
  it('parses the v1 contribution surface without Package role or executor assumptions', () => {
    expect(parseOplAppContributions(contributions())).toEqual({
      schemaVersion: 'opl-app-contributions.v1',
      navigation: [
        {
          navigationId: 'relay.inbox',
          labelI18n: { 'zh-CN': '收件箱', 'en-US': 'Inbox' },
          viewId: 'relay.inbox',
          iconId: 'mail',
          sortOrder: 10,
        },
      ],
      views: [
        {
          viewId: 'relay.inbox',
          viewType: 'list_detail',
          titleI18n: { 'zh-CN': '收件箱', 'en-US': 'Inbox' },
          dataRef: 'communications.mail.inbox.v1',
          commandIds: ['relay.create_draft'],
          badgeIds: ['relay.unread'],
          emptyStateI18n: { 'zh-CN': '暂无邮件', 'en-US': 'No messages' },
        },
      ],
      commands: [
        {
          commandId: 'relay.create_draft',
          labelI18n: { 'zh-CN': '创建草稿', 'en-US': 'Create draft' },
          actionRef: 'communications.mail.create_draft.v1',
          confirmationRequired: false,
        },
      ],
      badges: [
        {
          badgeId: 'relay.unread',
          labelI18n: { 'zh-CN': '未读', 'en-US': 'Unread' },
          dataRef: 'communications.mail.unread_count.v1',
          tone: 'info',
        },
      ],
    });
  });

  it('discovers contributions from any Package role and nested App-state payloads', () => {
    expect(
      getOplPackageAppContributionsFromAppState({
        app_state: {
          agent_packages: {
            directory: {
              entries: [
                {
                  package_id: 'opl-relay',
                  package_role: 'communication_tool',
                  installed: true,
                  app_contributions: contributions(),
                },
                {
                  package_id: 'opl-flow',
                  package_role: 'workflow_profile',
                  installed: true,
                },
              ],
            },
          },
        },
      })
    ).toEqual([
      {
        packageId: 'opl-relay',
        installed: true,
        contributions: expect.objectContaining({ schemaVersion: 'opl-app-contributions.v1' }),
      },
    ]);
  });

  it('resolves visible Home navigation without standard-Agent or Codex route filtering', () => {
    const appState = {
      agent_packages: {
        directory: {
          entries: [
            {
              package_id: 'opl-relay',
              package_role: 'communication_tool',
              installed: true,
              app_contributions: contributions(),
            },
          ],
        },
      },
    };
    expect(getOplHomeAppNavigationFromAppState(appState)).toEqual([
      {
        navigation_id: 'relay.inbox',
        package_id: 'opl-relay',
        label_i18n: { 'zh-CN': '收件箱', 'en-US': 'Inbox' },
        view_id: 'relay.inbox',
        icon_id: 'mail',
        installed: true,
        sort_order: 10,
      },
    ]);
    expect(resolveOplHomeAppContributions(appState)).toEqual([
      expect.objectContaining({
        navigation_id: 'relay.inbox',
        package_id: 'opl-relay',
        view: expect.objectContaining({ viewId: 'relay.inbox', viewType: 'list_detail' }),
        commands: [expect.objectContaining({ commandId: 'relay.create_draft' })],
        badges: [expect.objectContaining({ badgeId: 'relay.unread' })],
      }),
    ]);
  });

  it('orders navigation independently of Package role', () => {
    const later = contributions();
    later.navigation[0].sort_order = 20;
    const earlier = contributions();
    earlier.navigation[0] = {
      ...earlier.navigation[0],
      navigation_id: 'relay.drafts',
      view_id: 'relay.drafts',
      sort_order: 5,
    };
    earlier.views[0] = { ...earlier.views[0], view_id: 'relay.drafts' };
    const appState = {
      agent_packages: {
        directory: {
          entries: [
            { package_id: 'opl-relay', installed: true, app_contributions: later },
            { package_id: 'other-relay', package_role: 'other', installed: false, app_contributions: earlier },
          ],
        },
      },
    };
    expect(getOplHomeAppNavigationFromAppState(appState).map((entry) => entry.navigation_id)).toEqual([
      'relay.drafts',
      'relay.inbox',
    ]);
    expect(resolveOplHomeAppContributions(appState)).toHaveLength(2);
  });

  it.each([
    ['unknown view type', { views: [{ ...contributions().views[0], view_type: 'custom_react' }] }],
    ['malformed navigation', { navigation: [{ ...contributions().navigation[0], label_i18n: 'Inbox' }] }],
    [
      'invalid locale',
      { navigation: [{ ...contributions().navigation[0], label_i18n: { 'not a locale': '受信トレイ' } }] },
    ],
    ['dangling view reference', { navigation: [{ ...contributions().navigation[0], view_id: 'missing' }] }],
    ['dangling command reference', { views: [{ ...contributions().views[0], command_ids: ['missing'] }] }],
    ['code injection field', { views: [{ ...contributions().views[0], component: 'RelayInbox' }] }],
    ['duplicate command', { commands: [contributions().commands[0], contributions().commands[0]] }],
  ])('rejects %s', (_label, replacement) => {
    expect(parseOplAppContributions({ ...contributions(), ...replacement })).toBeNull();
  });
});
