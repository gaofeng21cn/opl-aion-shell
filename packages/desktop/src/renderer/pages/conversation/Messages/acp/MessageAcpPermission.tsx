/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IMessageAcpPermission } from '@/common/chat/chatLib';
import { codexThreads, conversation } from '@/common/adapter/ipcBridge';
import type {
  CodexThreadApprovalDecision,
  CodexThreadInteraction,
  CodexThreadUserInputQuestion,
} from '@/common/types/codex/appServerThreads';
import { openExternalUrl } from '@/renderer/utils/platform';
import { clearWaitingConfirmationById } from '@/renderer/pages/conversation/GroupedHistory/hooks/useConversationListSync';
import { Button, Card, Checkbox, Input, InputNumber, Radio, Select, Typography } from '@arco-design/web-react';
import { BookOpen, CheckOne, Earth, Edit, Lightning, Lock } from '@icon-park/react';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

const { Text } = Typography;

interface MessageAcpPermissionProps {
  message: IMessageAcpPermission;
}

type JsonRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const interactionFromMessage = (message: IMessageAcpPermission): CodexThreadInteraction | null => {
  const raw = message.content?.tool_call?.raw_input?.codex_interaction;
  return isRecord(raw) && typeof raw.kind === 'string' ? (raw as CodexThreadInteraction) : null;
};

const initialFormValues = (interaction: CodexThreadInteraction | null): JsonRecord => {
  if (interaction?.kind !== 'mcp_elicitation' || interaction.elicitation.mode !== 'form') return {};
  const properties = interaction.elicitation.requestedSchema?.properties;
  if (!isRecord(properties)) return {};
  return Object.fromEntries(
    Object.entries(properties).flatMap(([id, schema]) =>
      isRecord(schema) && schema.default !== undefined ? [[id, schema.default]] : []
    )
  );
};

const enumOptions = (schema: JsonRecord): Array<{ label: string; value: string }> => {
  const source = schema.type === 'array' && isRecord(schema.items) ? schema.items : schema;
  if (Array.isArray(source.enum)) {
    return source.enum.flatMap((value) => (typeof value === 'string' ? [{ label: value, value }] : []));
  }
  const variants = Array.isArray(source.anyOf) ? source.anyOf : Array.isArray(source.oneOf) ? source.oneOf : [];
  return variants.flatMap((value) => {
    if (!isRecord(value) || typeof value.const !== 'string') return [];
    return [{ label: typeof value.title === 'string' ? value.title : value.const, value: value.const }];
  });
};

const hasValue = (value: unknown): boolean =>
  value === false ||
  value === 0 ||
  (typeof value === 'string' && value.trim().length > 0) ||
  (Array.isArray(value) && value.length > 0);

const renderPermissionIcon = (kind?: string): React.ReactNode => {
  const iconProps = {
    theme: 'outline' as const,
    size: 20,
    fill: 'currentColor',
    'aria-hidden': true,
  };

  switch (kind) {
    case 'edit':
      return <Edit {...iconProps} />;
    case 'read':
      return <BookOpen {...iconProps} />;
    case 'fetch':
      return <Earth {...iconProps} />;
    case 'execute':
      return <Lightning {...iconProps} />;
    default:
      return <Lock {...iconProps} />;
  }
};

const MessageAcpPermission: React.FC<MessageAcpPermissionProps> = React.memo(({ message }) => {
  const { options = [], tool_call } = message.content || {};
  const { t } = useTranslation();
  const interaction = useMemo(() => interactionFromMessage(message), [message]);

  // 基于实际数据生成显示信息
  const getToolInfo = () => {
    if (!tool_call) {
      return {
        title: t('messages.permissionRequest'),
        description: t('messages.agentRequestingPermission'),
        icon: renderPermissionIcon(),
      };
    }

    const displayTitle = tool_call.title || tool_call.raw_input?.description || t('messages.permissionRequest');

    return {
      title: displayTitle,
      icon: renderPermissionIcon(tool_call.kind || 'execute'),
    };
  };
  const { title, icon } = getToolInfo();
  const [selected, setSelected] = useState<string | null>(interaction?.kind === 'request_user_input' ? 'accept' : null);
  const [questionAnswers, setQuestionAnswers] = useState<Record<string, string>>({});
  const [formValues, setFormValues] = useState<JsonRecord>(() => initialFormValues(interaction));
  const [openAiFormJson, setOpenAiFormJson] = useState('{}');
  const [isResponding, setIsResponding] = useState(false);
  const [hasResponded, setHasResponded] = useState(false);

  const userInputComplete =
    interaction?.kind !== 'request_user_input' ||
    interaction.questions.every((question) => Boolean(questionAnswers[question.id]?.trim()));
  const accepting = selected === 'accept' || selected === 'acceptForSession' || selected === 'acceptAlways';
  const elicitationComplete = (() => {
    if (interaction?.kind !== 'mcp_elicitation' || !accepting) return true;
    if (interaction.elicitation.mode === 'openai/form') {
      try {
        return isRecord(JSON.parse(openAiFormJson) as unknown);
      } catch {
        return false;
      }
    }
    if (interaction.elicitation.mode !== 'form') return true;
    const required = interaction.elicitation.requestedSchema?.required;
    return !Array.isArray(required) || required.every((id) => typeof id === 'string' && hasValue(formValues[id]));
  })();
  const canConfirm = Boolean(selected) && userInputComplete && elicitationComplete && !isResponding;

  const handleConfirm = async () => {
    if (hasResponded || !selected) return;

    setIsResponding(true);
    try {
      if (tool_call?.raw_input?.codex_app_server_request === true) {
        const answers =
          interaction?.kind === 'request_user_input'
            ? Object.fromEntries(
                interaction.questions.map((question) => [
                  question.id,
                  { answers: [questionAnswers[question.id]?.trim() ?? ''] },
                ])
              )
            : undefined;
        const content =
          interaction?.kind === 'mcp_elicitation' && accepting
            ? interaction.elicitation.mode === 'openai/form'
              ? (JSON.parse(openAiFormJson) as JsonRecord)
              : formValues
            : undefined;
        await codexThreads.respondApproval.invoke({
          requestId: tool_call.tool_call_id,
          decision: selected as CodexThreadApprovalDecision,
          ...(answers ? { answers } : {}),
          ...(content ? { content } : {}),
        });
        clearWaitingConfirmationById(message.conversation_id, tool_call.tool_call_id);
        setHasResponded(true);
        return;
      }
      const invokeData = {
        confirm_key: selected,
        msg_id: message.id,
        conversation_id: message.conversation_id,
        call_id: tool_call?.tool_call_id || message.id,
      };

      await conversation.confirmMessage.invoke(invokeData);
      clearWaitingConfirmationById(message.conversation_id, invokeData.call_id);
      setHasResponded(true);
    } catch (error) {
      // Handle error case - could add error logging here
      console.error('Error confirming permission:', error);
    } finally {
      setIsResponding(false);
    }
  };

  if (!tool_call) {
    return null;
  }

  const renderQuestion = (question: CodexThreadUserInputQuestion) => (
    <div key={question.id} className='space-y-2' data-testid={`codex-user-input-${question.id}`}>
      {question.header && <Text bold>{question.header}</Text>}
      <Text className='block'>{question.question}</Text>
      {question.options && question.options.length > 0 ? (
        <Radio.Group
          direction='vertical'
          value={questionAnswers[question.id]}
          onChange={(value) => setQuestionAnswers((current) => ({ ...current, [question.id]: String(value) }))}
        >
          {question.options.map((option) => (
            <Radio key={option.label} value={option.label}>
              <span>{option.label}</span>
              {option.description && <Text type='secondary'> - {option.description}</Text>}
            </Radio>
          ))}
        </Radio.Group>
      ) : (
        <Input
          type={question.isSecret ? 'password' : 'text'}
          value={questionAnswers[question.id] ?? ''}
          placeholder={t('messages.answerPlaceholder')}
          onChange={(value) => setQuestionAnswers((current) => ({ ...current, [question.id]: value }))}
          data-testid={`codex-user-input-value-${question.id}`}
        />
      )}
      {question.isOther && question.options && (
        <Input
          type={question.isSecret ? 'password' : 'text'}
          value={
            question.options.some((option) => option.label === questionAnswers[question.id])
              ? ''
              : (questionAnswers[question.id] ?? '')
          }
          placeholder={t('messages.otherAnswer')}
          onChange={(value) => setQuestionAnswers((current) => ({ ...current, [question.id]: value }))}
          data-testid={`codex-user-input-other-${question.id}`}
        />
      )}
    </div>
  );

  const renderElicitationForm = () => {
    if (interaction?.kind !== 'mcp_elicitation') return null;
    const { elicitation } = interaction;
    if (elicitation.mode === 'url') {
      return elicitation.url ? (
        <Button
          type='outline'
          size='mini'
          onClick={() => void openExternalUrl(elicitation.url as string)}
          data-testid='codex-elicitation-open-url'
        >
          {t('messages.openRequestUrl')}
        </Button>
      ) : null;
    }
    if (elicitation.mode === 'openai/form') {
      return (
        <Input.TextArea
          value={openAiFormJson}
          onChange={setOpenAiFormJson}
          autoSize={{ minRows: 3, maxRows: 10 }}
          data-testid='codex-elicitation-openai-form'
        />
      );
    }
    const properties = elicitation.requestedSchema?.properties;
    if (!isRecord(properties)) return null;
    const required = Array.isArray(elicitation.requestedSchema?.required)
      ? new Set(elicitation.requestedSchema.required.filter((value): value is string => typeof value === 'string'))
      : new Set<string>();
    return (
      <div className='space-y-3'>
        {Object.entries(properties).map(([id, schemaValue]) => {
          if (!isRecord(schemaValue)) return null;
          const label = typeof schemaValue.title === 'string' ? schemaValue.title : id;
          const description = typeof schemaValue.description === 'string' ? schemaValue.description : '';
          const choices = enumOptions(schemaValue);
          const value = formValues[id];
          const update = (next: unknown) => setFormValues((current) => ({ ...current, [id]: next }));
          return (
            <label key={id} className='block space-y-1' data-testid={`codex-elicitation-field-${id}`}>
              <Text bold>
                {label}
                {required.has(id) ? ` ${t('messages.requiredField')}` : ''}
              </Text>
              {description && (
                <Text type='secondary' className='block'>
                  {description}
                </Text>
              )}
              {schemaValue.type === 'boolean' ? (
                <Checkbox checked={value === true} onChange={update} />
              ) : choices.length > 0 ? (
                <Select
                  value={value as string | string[] | undefined}
                  mode={schemaValue.type === 'array' ? 'multiple' : undefined}
                  options={choices}
                  onChange={update}
                />
              ) : schemaValue.type === 'number' || schemaValue.type === 'integer' ? (
                <InputNumber
                  value={typeof value === 'number' ? value : undefined}
                  precision={schemaValue.type === 'integer' ? 0 : undefined}
                  min={typeof schemaValue.minimum === 'number' ? schemaValue.minimum : undefined}
                  max={typeof schemaValue.maximum === 'number' ? schemaValue.maximum : undefined}
                  onChange={update}
                />
              ) : (
                <Input
                  value={typeof value === 'string' ? value : ''}
                  onChange={update}
                  data-testid={`codex-elicitation-value-${id}`}
                />
              )}
            </label>
          );
        })}
      </div>
    );
  };

  return (
    <Card
      className='mb-4'
      bordered={false}
      style={{ background: 'var(--bg-1)' }}
      data-testid='message-acp-permission-card'
    >
      <div className='space-y-4'>
        {/* Header with icon and title */}
        <div className='flex items-center space-x-2'>
          <span className='inline-flex shrink-0 text-t-secondary'>{icon}</span>
          <Text className='block'>{title}</Text>
        </div>
        {(tool_call.raw_input?.command || tool_call.title) && (
          <div>
            <Text className='text-xs text-t-secondary mb-1'>{t('messages.command')}</Text>
            <code className='text-xs bg-1 p-2 rounded block text-t-primary break-all'>
              {tool_call.raw_input?.command || tool_call.title}
            </code>
          </div>
        )}
        {interaction?.kind === 'request_user_input' && (
          <div className='space-y-4'>{interaction.questions.map(renderQuestion)}</div>
        )}
        {interaction?.kind === 'mcp_elicitation' && (
          <div className='space-y-3'>
            {interaction.elicitation.message && <Text className='block'>{interaction.elicitation.message}</Text>}
            {renderElicitationForm()}
          </div>
        )}
        {interaction?.kind === 'permissions' && (
          <div>
            <Text className='text-xs text-t-secondary mb-1'>{t('messages.requestedPermissions')}</Text>
            <pre className='bg-1 p-2 rounded text-xs overflow-x-auto'>
              {JSON.stringify(interaction.request.permissions, null, 2)}
            </pre>
          </div>
        )}
        {!hasResponded && (
          <>
            {interaction?.kind !== 'request_user_input' && (
              <>
                <div className='mt-10px'>{t('messages.chooseAction')}</div>
                <Radio.Group direction='vertical' size='mini' value={selected} onChange={setSelected}>
                  {options && options.length > 0 ? (
                    options.map((option, index) => {
                      const optionName = option?.name || `${t('messages.option')} ${index + 1}`;
                      const option_id = option?.option_id || `option_${index}`;
                      return (
                        <div key={option_id} data-testid={`message-acp-permission-option-${option_id}`}>
                          <Radio value={option_id}>{optionName}</Radio>
                        </div>
                      );
                    })
                  ) : (
                    <Text type='secondary'>{t('messages.noOptionsAvailable')}</Text>
                  )}
                </Radio.Group>
              </>
            )}
            <div className='flex justify-start pl-20px'>
              <Button
                type='primary'
                size='mini'
                disabled={!canConfirm}
                onClick={handleConfirm}
                data-testid='message-acp-permission-confirm'
              >
                {isResponding ? t('messages.processing') : t('messages.confirm')}
              </Button>
            </div>
          </>
        )}

        {hasResponded && (
          <div
            className='mt-10px p-2 rounded-md border'
            style={{ backgroundColor: 'var(--color-success-light-1)', borderColor: 'rgb(var(--success-3))' }}
          >
            <Text className='inline-flex items-center gap-4px text-sm' style={{ color: 'rgb(var(--success-6))' }}>
              <CheckOne theme='outline' size='14' fill='currentColor' aria-hidden='true' />
              <span>{t('messages.responseSentSuccessfully')}</span>
            </Text>
          </div>
        )}
      </div>
    </Card>
  );
});

export default MessageAcpPermission;
