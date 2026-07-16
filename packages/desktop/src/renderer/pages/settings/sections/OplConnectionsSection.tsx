import React, { useState } from 'react';
import { Button, Input, Modal, Select, Space, Switch, Tag, Tooltip, Typography } from '@arco-design/web-react';
import { CheckOne, Delete, EditTwo, LinkCloud, Plus } from '@icon-park/react';
import { oplRecord } from '@/renderer/hooks/system/useOplAppState';
import { useTranslation } from 'react-i18next';

type ConnectionStatus = 'untested' | 'ready' | 'attention_needed' | 'disabled';
type OplConnection = {
  connectionId: string;
  name: string;
  connectionType: string;
  endpoint: string;
  credentialHandle: string;
  status: ConnectionStatus;
  statusCode: string;
  disabled: boolean;
};
export type ConnectionRegistry = {
  defaultConnectionId: string | null;
  connections: OplConnection[];
};
type ConnectionFormValue = {
  connectionId: string;
  name: string;
  connectionType: string;
  endpoint: string;
  credentialKind: 'codex' | 'env';
  envName: string;
  disabled: boolean;
};

const EMPTY_CONNECTION_FORM: ConnectionFormValue = {
  connectionId: '',
  name: '',
  connectionType: 'openai_compatible',
  endpoint: '',
  credentialKind: 'codex',
  envName: '',
  disabled: false,
};
const ENV_NAME_PATTERN = /^[A-Z_][A-Z0-9_]*$/;
const OPL_GATEWAY_CONNECTION_ID = 'opl-gateway-account';
const OPL_GATEWAY_CREDENTIAL_HANDLE = 'credential-store:opl-gateway-account';

function isHttpEndpoint(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return (url.protocol === 'http:' || url.protocol === 'https:') && Boolean(url.hostname);
  } catch {
    return false;
  }
}

export function buildConnectionRegistry(appState: Record<string, unknown>): ConnectionRegistry {
  const controlCenter = oplRecord(appState.settings_control_center);
  const registry = oplRecord(controlCenter.connection_registry);
  const connections = Array.isArray(registry.connections)
    ? registry.connections.flatMap((value): OplConnection[] => {
        const connection = oplRecord(value);
        const connectionId = typeof connection.connection_id === 'string' ? connection.connection_id.trim() : '';
        const credentialHandle =
          typeof connection.credential_handle === 'string' ? connection.credential_handle.trim() : '';
        if (
          !connectionId ||
          connectionId === OPL_GATEWAY_CONNECTION_ID ||
          credentialHandle === OPL_GATEWAY_CREDENTIAL_HANDLE
        ) {
          return [];
        }
        const statusValue = typeof connection.status === 'string' ? connection.status : 'untested';
        const status: ConnectionStatus = ['untested', 'ready', 'attention_needed', 'disabled'].includes(statusValue)
          ? (statusValue as ConnectionStatus)
          : 'untested';
        return [
          {
            connectionId,
            name: typeof connection.name === 'string' && connection.name.trim() ? connection.name.trim() : connectionId,
            connectionType: typeof connection.connection_type === 'string' ? connection.connection_type : '',
            endpoint: typeof connection.endpoint === 'string' ? connection.endpoint : '',
            credentialHandle,
            status,
            statusCode: typeof connection.status_code === 'string' ? connection.status_code : '',
            disabled: connection.disabled === true || status === 'disabled',
          },
        ];
      })
    : [];
  const configuredDefaultConnectionId =
    typeof registry.default_connection_id === 'string' ? registry.default_connection_id.trim() : '';
  return {
    defaultConnectionId: connections.some((connection) => connection.connectionId === configuredDefaultConnectionId)
      ? configuredDefaultConnectionId
      : null,
    connections,
  };
}

function connectionFormValue(connection: OplConnection): ConnectionFormValue {
  const envName = connection.credentialHandle.startsWith('env:') ? connection.credentialHandle.slice(4) : '';
  return {
    connectionId: connection.connectionId,
    name: connection.name,
    connectionType: connection.connectionType,
    endpoint: connection.endpoint,
    credentialKind: envName && ENV_NAME_PATTERN.test(envName) ? 'env' : 'codex',
    envName,
    disabled: connection.disabled,
  };
}

function connectionPayload(value: ConnectionFormValue): Record<string, unknown> {
  return {
    connection_id: value.connectionId.trim(),
    name: value.name.trim(),
    connection_type: value.connectionType.trim(),
    endpoint: value.endpoint.trim(),
    credential_handle: value.credentialKind === 'codex' ? 'codex:selected_provider' : `env:${value.envName.trim()}`,
    disabled: value.disabled,
  };
}

const OplConnectionsSection: React.FC<{
  registry: ConnectionRegistry;
  runningActionId: string | null;
  onAction: (actionId: string, payloadRefsOnlyJson: Record<string, unknown>) => Promise<boolean>;
}> = ({ registry, runningActionId, onAction }) => {
  const { t } = useTranslation();
  const [formMode, setFormMode] = useState<'create' | 'edit' | null>(null);
  const [formValue, setFormValue] = useState<ConnectionFormValue>(EMPTY_CONNECTION_FORM);
  const [connectionToDelete, setConnectionToDelete] = useState<OplConnection | null>(null);
  const busy = runningActionId !== null;
  const formValid =
    Boolean(formValue.connectionId.trim() && formValue.name.trim() && formValue.connectionType.trim()) &&
    isHttpEndpoint(formValue.endpoint) &&
    (formValue.credentialKind === 'codex' || ENV_NAME_PATTERN.test(formValue.envName.trim()));

  const submitForm = async () => {
    if (!formMode || !formValid) return;
    const succeeded = await onAction(
      formMode === 'create' ? 'connection_create' : 'connection_update',
      connectionPayload(formValue)
    );
    if (succeeded) setFormMode(null);
  };

  const confirmDelete = async () => {
    if (!connectionToDelete) return;
    const succeeded = await onAction('connection_delete', { connection_id: connectionToDelete.connectionId });
    if (succeeded) setConnectionToDelete(null);
  };

  return (
    <section className='opl-settings-section' id='external-resources' data-testid='opl-connections-section'>
      <div className='opl-settings-section__header'>
        <div>
          <Typography.Text className='block font-600 text-t-primary'>
            {t('settings.resourcesPage.oplConnections.title')}
          </Typography.Text>
          <Typography.Text className='block text-12px text-t-secondary'>
            {t('settings.resourcesPage.oplConnections.description')}
          </Typography.Text>
        </div>
        <Button
          type='secondary'
          icon={<Plus theme='outline' />}
          disabled={busy}
          onClick={() => {
            setFormValue(EMPTY_CONNECTION_FORM);
            setFormMode('create');
          }}
          data-testid='opl-settings-add-connection'
        >
          {t('settings.resourcesPage.oplConnections.add')}
        </Button>
      </div>

      {registry.connections.length === 0 ? (
        <div className='opl-settings-row' data-testid='opl-connections-empty'>
          <div className='opl-settings-row__main flex min-w-0 items-center gap-10px'>
            <LinkCloud className='shrink-0 text-t-secondary' theme='outline' />
            <Typography.Text className='text-13px text-t-secondary'>
              {t('settings.resourcesPage.oplConnections.empty')}
            </Typography.Text>
          </div>
        </div>
      ) : (
        <div className='opl-settings-list'>
          {registry.connections.map((connection) => {
            const isDefault = registry.defaultConnectionId === connection.connectionId;
            return (
              <div
                className='opl-settings-row items-start'
                key={connection.connectionId}
                data-testid={`opl-connection-${connection.connectionId}`}
              >
                <div className='opl-settings-row__main min-w-0'>
                  <div className='flex flex-wrap items-center gap-6px'>
                    <Typography.Text className='font-600 text-t-primary'>{connection.name}</Typography.Text>
                    {isDefault && <Tag color='arcoblue'>{t('settings.resourcesPage.oplConnections.default')}</Tag>}
                    <ConnectionStatusTag status={connection.status} />
                  </div>
                  <Typography.Text className='block break-words text-12px text-t-secondary'>
                    {[
                      connection.connectionType === 'openai_compatible'
                        ? t('settings.resourcesPage.oplConnections.form.openAiCompatible')
                        : t('settings.resourcesPage.oplConnections.otherConnectionType'),
                      connection.endpoint,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </Typography.Text>
                  <Typography.Text className='block break-words text-12px text-t-secondary'>
                    {connection.credentialHandle.startsWith('env:')
                      ? t('settings.resourcesPage.oplConnections.envCredentialSummary', {
                          name: connection.credentialHandle.slice(4),
                        })
                      : t('settings.resourcesPage.oplConnections.codexCredentialSummary')}
                  </Typography.Text>
                  {connection.status === 'attention_needed' && connection.statusCode && (
                    <Typography.Text className='block break-words text-12px text-danger'>
                      {t(`settings.resourcesPage.oplConnections.statusCode.${connection.statusCode}`, {
                        defaultValue: t('settings.resourcesPage.oplConnections.statusCode.generic'),
                      })}
                    </Typography.Text>
                  )}
                </div>
                <div className='opl-settings-row__meta flex flex-wrap items-center gap-6px'>
                  <Button
                    size='mini'
                    type='secondary'
                    icon={<CheckOne theme='outline' />}
                    loading={runningActionId === `connection_test:${connection.connectionId}`}
                    disabled={busy || connection.disabled}
                    onClick={() => void onAction('connection_test', { connection_id: connection.connectionId })}
                    data-testid={`opl-connection-test-${connection.connectionId}`}
                  >
                    {t('settings.resourcesPage.oplConnections.test')}
                  </Button>
                  {!isDefault && (
                    <Button
                      size='mini'
                      type='secondary'
                      disabled={busy || connection.disabled}
                      onClick={() =>
                        void onAction('connection_set_default', { connection_id: connection.connectionId })
                      }
                      data-testid={`opl-connection-default-${connection.connectionId}`}
                    >
                      {t('settings.resourcesPage.oplConnections.setDefault')}
                    </Button>
                  )}
                  <Button
                    size='mini'
                    icon={<EditTwo theme='outline' />}
                    aria-label={t('common.edit')}
                    title={t('common.edit')}
                    disabled={busy}
                    onClick={() => {
                      setFormValue(connectionFormValue(connection));
                      setFormMode('edit');
                    }}
                    data-testid={`opl-connection-edit-${connection.connectionId}`}
                  />
                  <Tooltip
                    content={isDefault ? t('settings.resourcesPage.oplConnections.defaultDeleteHelp') : undefined}
                  >
                    <Button
                      size='mini'
                      status='danger'
                      icon={<Delete theme='outline' />}
                      aria-label={t('common.delete')}
                      title={t('common.delete')}
                      disabled={busy || isDefault}
                      onClick={() => setConnectionToDelete(connection)}
                      data-testid={`opl-connection-delete-${connection.connectionId}`}
                    />
                  </Tooltip>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal
        visible={formMode !== null}
        title={t(
          formMode === 'edit'
            ? 'settings.resourcesPage.oplConnections.form.editTitle'
            : 'settings.resourcesPage.oplConnections.form.createTitle'
        )}
        footer={
          <Space>
            <Button disabled={busy} onClick={() => setFormMode(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              type='primary'
              loading={runningActionId?.startsWith(`connection_${formMode}:`) ?? false}
              disabled={busy || !formValid}
              onClick={() => void submitForm()}
              data-testid='opl-connection-form-submit'
            >
              {t('common.save')}
            </Button>
          </Space>
        }
        onCancel={() => setFormMode(null)}
        unmountOnExit
      >
        <div className='flex flex-col gap-12px' data-testid='opl-connection-form'>
          <ConnectionField label={t('settings.resourcesPage.oplConnections.form.connectionId')}>
            <Input
              value={formValue.connectionId}
              disabled={formMode === 'edit'}
              onChange={(connectionId) => setFormValue((current) => ({ ...current, connectionId }))}
              data-testid='opl-connection-field-id'
            />
          </ConnectionField>
          <ConnectionField label={t('settings.resourcesPage.oplConnections.form.name')}>
            <Input
              value={formValue.name}
              onChange={(name) => setFormValue((current) => ({ ...current, name }))}
              data-testid='opl-connection-field-name'
            />
          </ConnectionField>
          <ConnectionField label={t('settings.resourcesPage.oplConnections.form.type')}>
            <Select
              value={formValue.connectionType}
              options={[
                {
                  label: t('settings.resourcesPage.oplConnections.form.openAiCompatible'),
                  value: 'openai_compatible',
                },
              ]}
              onChange={(connectionType) =>
                setFormValue((current) => ({ ...current, connectionType: String(connectionType) }))
              }
              data-testid='opl-connection-field-type'
            />
            <Typography.Text className='text-12px text-t-tertiary'>
              {t('settings.resourcesPage.oplConnections.form.openAiCompatibleHelp')}
            </Typography.Text>
          </ConnectionField>
          <ConnectionField label={t('settings.resourcesPage.oplConnections.form.endpoint')}>
            <Input
              value={formValue.endpoint}
              status={formValue.endpoint && !isHttpEndpoint(formValue.endpoint) ? 'error' : undefined}
              onChange={(endpoint) => setFormValue((current) => ({ ...current, endpoint }))}
              placeholder='https://api.example.com/v1'
              data-testid='opl-connection-field-endpoint'
            />
          </ConnectionField>
          <ConnectionField label={t('settings.resourcesPage.oplConnections.form.credential')}>
            <Select
              value={formValue.credentialKind}
              options={[
                { label: t('settings.resourcesPage.oplConnections.form.codexCredential'), value: 'codex' },
                { label: t('settings.resourcesPage.oplConnections.form.envCredential'), value: 'env' },
              ]}
              onChange={(credentialKind) =>
                setFormValue((current) => ({ ...current, credentialKind: credentialKind as 'codex' | 'env' }))
              }
              data-testid='opl-connection-field-credential-kind'
            />
          </ConnectionField>
          {formValue.credentialKind === 'env' && (
            <ConnectionField label={t('settings.resourcesPage.oplConnections.form.envName')}>
              <Input
                value={formValue.envName}
                status={formValue.envName && !ENV_NAME_PATTERN.test(formValue.envName) ? 'error' : undefined}
                onChange={(envName) => setFormValue((current) => ({ ...current, envName }))}
                placeholder='OPENAI_API_KEY'
                data-testid='opl-connection-field-env-name'
              />
            </ConnectionField>
          )}
          {formMode === 'edit' && (
            <div className='flex items-center justify-between gap-12px'>
              <div className='min-w-0'>
                <Typography.Text className='block text-13px text-t-primary'>
                  {t('settings.resourcesPage.oplConnections.form.enabled')}
                </Typography.Text>
                <Typography.Text className='block text-12px text-t-tertiary'>
                  {t('settings.resourcesPage.oplConnections.form.enabledHelp')}
                </Typography.Text>
              </div>
              <Switch
                size='small'
                checked={!formValue.disabled}
                onChange={(enabled) => setFormValue((current) => ({ ...current, disabled: !enabled }))}
                data-testid='opl-connection-field-enabled'
              />
            </div>
          )}
        </div>
      </Modal>

      <Modal
        visible={connectionToDelete !== null}
        title={t('settings.resourcesPage.oplConnections.deleteTitle')}
        footer={
          <Space>
            <Button disabled={busy} onClick={() => setConnectionToDelete(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              status='danger'
              loading={runningActionId?.startsWith('connection_delete:') ?? false}
              disabled={busy}
              onClick={() => void confirmDelete()}
              data-testid='opl-connection-delete-confirm'
            >
              {t('common.delete')}
            </Button>
          </Space>
        }
        onCancel={() => setConnectionToDelete(null)}
        unmountOnExit
      >
        <Typography.Text>{t('settings.resourcesPage.oplConnections.deleteDescription')}</Typography.Text>
      </Modal>
    </section>
  );
};

const ConnectionStatusTag: React.FC<{ status: ConnectionStatus }> = ({ status }) => {
  const { t } = useTranslation();
  const color =
    status === 'ready'
      ? 'green'
      : status === 'attention_needed'
        ? 'orange'
        : status === 'disabled'
          ? 'gray'
          : 'arcoblue';
  return <Tag color={color}>{t(`settings.resourcesPage.oplConnections.status.${status}`)}</Tag>;
};

const ConnectionField: React.FC<React.PropsWithChildren<{ label: string }>> = ({ label, children }) => (
  <label className='flex flex-col gap-6px'>
    <Typography.Text className='text-12px text-t-secondary'>{label}</Typography.Text>
    {children}
  </label>
);

export default OplConnectionsSection;
