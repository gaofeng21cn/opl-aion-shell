/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import { Alert, Button, Input, Message, Select, Tag } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import type {
  CodexThreadServerRequest,
  ThreadCoordinationResolveServerRequest,
  ThreadCoordinationResolveServerRequestResult,
} from '@/common/types/codex/threadCoordination';

type Props = {
  requests: CodexThreadServerRequest[];
  onResolve: (request: ThreadCoordinationResolveServerRequest) => Promise<ThreadCoordinationResolveServerRequestResult>;
};

type ResolutionFailure = Extract<ThreadCoordinationResolveServerRequestResult, { ok: false }>;
type ServerRequestUiState =
  | 'approval_pending'
  | 'user_input_pending'
  | 'mcp_elicitation_pending'
  | 'server_request_resolving'
  | 'server_request_declined'
  | 'server_request_handler_unavailable'
  | 'dispatch_failed';

const JSON_TEXTAREA_AUTO_SIZE = { minRows: 3, maxRows: 8 };

function requestLabel(kind: CodexThreadServerRequest['kind']): string {
  return `conversation.threadCoordination.serverRequests.kind.${kind}`;
}

function pendingState(kind: CodexThreadServerRequest['kind']): ServerRequestUiState {
  if (kind === 'user_input') return 'user_input_pending';
  if (kind === 'mcp_elicitation') return 'mcp_elicitation_pending';
  return 'approval_pending';
}

function isDecline(request: ThreadCoordinationResolveServerRequest): boolean {
  if (request.response.kind === 'approval' || request.response.kind === 'permissions') {
    return request.response.decision === 'decline';
  }
  return (
    request.response.kind === 'mcp_elicitation' &&
    (request.response.action === 'decline' || request.response.action === 'cancel')
  );
}

const PendingServerRequests: React.FC<Props> = ({ requests, onResolve }) => {
  const { t } = useTranslation();
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, Record<string, string>>>({});
  const [elicitationContent, setElicitationContent] = useState<Record<string, string>>({});
  const [resolutionFailures, setResolutionFailures] = useState<Record<string, ResolutionFailure>>({});
  const [resolutionStates, setResolutionStates] = useState<Record<string, ServerRequestUiState>>({});

  const answerFor = (requestId: string, questionId: string): string => answers[requestId]?.[questionId] ?? '';
  const updateAnswer = (requestId: string, questionId: string, value: string) => {
    setAnswers((current) => ({
      ...current,
      [requestId]: { ...current[requestId], [questionId]: value },
    }));
  };

  const answerCompleteness = useMemo(
    () =>
      Object.fromEntries(
        requests.map((request) => [
          request.requestId,
          request.questions.every((question) => Boolean(answerFor(request.requestId, question.id).trim())),
        ])
      ),
    [answers, requests]
  );

  const resolve = async (request: ThreadCoordinationResolveServerRequest) => {
    setResolvingId(request.requestId);
    setResolutionFailures((current) => {
      const next = { ...current };
      delete next[request.requestId];
      return next;
    });
    setResolutionStates((current) => ({ ...current, [request.requestId]: 'server_request_resolving' }));
    try {
      const result = await onResolve(request);
      if (result.ok === true) {
        setResolutionStates((current) => ({
          ...current,
          [request.requestId]: isDecline(request) ? 'server_request_declined' : 'server_request_resolving',
        }));
        Message.success(t('conversation.threadCoordination.serverRequests.resolved'));
      } else {
        const failure: ResolutionFailure = result;
        setResolutionFailures((current) => ({ ...current, [request.requestId]: failure }));
        setResolutionStates((current) => ({
          ...current,
          [request.requestId]:
            failure.errorCode === 'server_request_handler_unavailable'
              ? 'server_request_handler_unavailable'
              : 'dispatch_failed',
        }));
        Message.error(failure.message);
      }
    } catch {
      const failure: ResolutionFailure = {
        ok: false,
        errorCode: 'protocol_error',
        message: t('conversation.threadCoordination.serverRequests.resolveFailed'),
      };
      setResolutionFailures((current) => ({ ...current, [request.requestId]: failure }));
      setResolutionStates((current) => ({ ...current, [request.requestId]: 'dispatch_failed' }));
      Message.error(t('conversation.threadCoordination.serverRequests.resolveFailed'));
    } finally {
      setResolvingId(null);
    }
  };

  if (requests.length === 0) return null;

  return (
    <section className='border-t border-solid border-[var(--color-border-2)] pt-16px'>
      <div className='mb-8px flex items-center gap-8px text-13px font-[600] text-t-primary'>
        <span>{t('conversation.threadCoordination.serverRequests.title')}</span>
        <Tag size='small' color='orangered'>
          {requests.length}
        </Tag>
      </div>
      <Alert
        type='warning'
        content={t('conversation.threadCoordination.serverRequests.description')}
        className='mb-10px'
      />
      <div className='flex flex-col gap-12px'>
        {requests.map((request) => {
          const loading = resolvingId === request.requestId;
          const resolutionFailure = resolutionFailures[request.requestId];
          return (
            <div
              key={request.requestId}
              data-testid={`thread-server-request-${request.requestId}`}
              data-state={resolutionStates[request.requestId] ?? pendingState(request.kind)}
              className='border-t border-solid border-[var(--color-border-2)] pt-10px first:border-t-0 first:pt-0'
            >
              <div className='flex items-center gap-8px'>
                <span className='min-w-0 flex-1 text-12px font-[600] text-t-primary'>
                  {t(requestLabel(request.kind))}
                </span>
                <span className='text-11px text-t-tertiary'>{request.observedAt}</span>
              </div>
              <div
                data-testid={`thread-server-request-context-${request.requestId}`}
                className='mt-5px flex flex-wrap gap-x-10px gap-y-3px break-all text-11px text-t-tertiary'
              >
                <span>{`${t('conversation.threadCoordination.serverRequests.contextThread')}: ${request.threadId}`}</span>
                {request.turnId && (
                  <span>{`${t('conversation.threadCoordination.serverRequests.contextTurn')}: ${request.turnId}`}</span>
                )}
                {request.itemId && (
                  <span>{`${t('conversation.threadCoordination.serverRequests.contextItem')}: ${request.itemId}`}</span>
                )}
              </div>
              {request.reason && <div className='mt-5px text-12px text-t-secondary'>{request.reason}</div>}
              {request.command && (
                <pre className='m-0 mt-8px max-h-120px overflow-auto whitespace-pre-wrap break-all bg-fill-1 px-10px py-8px text-11px leading-17px text-t-primary'>
                  {request.command}
                </pre>
              )}
              {request.cwd && <div className='mt-5px break-all text-11px text-t-tertiary'>{request.cwd}</div>}
              {resolutionFailure && (
                <Alert
                  type='error'
                  className='mt-8px'
                  data-testid={`thread-server-request-error-${request.requestId}`}
                  content={resolutionFailure.message}
                />
              )}

              {request.kind === 'user_input' && (
                <div className='mt-10px flex flex-col gap-10px'>
                  {request.questions.map((question) => (
                    <label key={question.id} className='flex flex-col gap-5px text-12px text-t-primary'>
                      <span>{question.header || question.question}</span>
                      {question.header && <span className='text-11px text-t-tertiary'>{question.question}</span>}
                      {question.options ? (
                        <Select
                          value={answerFor(request.requestId, question.id) || undefined}
                          aria-label={question.question}
                          disabled={loading}
                          onChange={(value) => updateAnswer(request.requestId, question.id, value)}
                        >
                          {question.options.map((option) => (
                            <Select.Option key={option.label} value={option.label}>
                              {option.label}
                              {option.description ? ` - ${option.description}` : ''}
                            </Select.Option>
                          ))}
                        </Select>
                      ) : (
                        <Input
                          type={question.isSecret ? 'password' : 'text'}
                          value={answerFor(request.requestId, question.id)}
                          aria-label={question.question}
                          disabled={loading}
                          onChange={(value) => updateAnswer(request.requestId, question.id, value)}
                        />
                      )}
                    </label>
                  ))}
                </div>
              )}

              {request.kind === 'mcp_elicitation' && (
                <div className='mt-10px'>
                  <div className='text-12px text-t-secondary'>{request.elicitation?.message}</div>
                  {request.elicitation?.url && (
                    <div className='mt-4px break-all text-11px text-t-tertiary'>{request.elicitation.url}</div>
                  )}
                  <Input.TextArea
                    className='mt-8px'
                    value={elicitationContent[request.requestId] ?? '{}'}
                    aria-label={t('conversation.threadCoordination.serverRequests.responseJson')}
                    placeholder={t('conversation.threadCoordination.serverRequests.responseJson')}
                    autoSize={JSON_TEXTAREA_AUTO_SIZE}
                    disabled={loading}
                    onChange={(value) =>
                      setElicitationContent((current) => ({ ...current, [request.requestId]: value }))
                    }
                  />
                </div>
              )}

              <div className='mt-10px flex flex-wrap gap-8px'>
                {(request.kind === 'command_approval' || request.kind === 'file_change_approval') && (
                  <>
                    <Button
                      size='small'
                      type='primary'
                      loading={loading}
                      onClick={() =>
                        void resolve({
                          requestId: request.requestId,
                          response: { kind: 'approval', decision: 'accept' },
                        })
                      }
                    >
                      {t('conversation.threadCoordination.serverRequests.accept')}
                    </Button>
                    <Button
                      size='small'
                      loading={loading}
                      onClick={() =>
                        void resolve({
                          requestId: request.requestId,
                          response: { kind: 'approval', decision: 'accept_for_session' },
                        })
                      }
                    >
                      {t('conversation.threadCoordination.serverRequests.acceptForSession')}
                    </Button>
                    <Button
                      size='small'
                      status='danger'
                      loading={loading}
                      onClick={() =>
                        void resolve({
                          requestId: request.requestId,
                          response: { kind: 'approval', decision: 'decline' },
                        })
                      }
                    >
                      {t('conversation.threadCoordination.serverRequests.decline')}
                    </Button>
                  </>
                )}
                {request.kind === 'permissions_approval' && (
                  <>
                    <Button
                      size='small'
                      type='primary'
                      loading={loading}
                      onClick={() =>
                        void resolve({
                          requestId: request.requestId,
                          response: { kind: 'permissions', decision: 'accept' },
                        })
                      }
                    >
                      {t('conversation.threadCoordination.serverRequests.accept')}
                    </Button>
                    <Button
                      size='small'
                      loading={loading}
                      onClick={() =>
                        void resolve({
                          requestId: request.requestId,
                          response: { kind: 'permissions', decision: 'accept_for_session' },
                        })
                      }
                    >
                      {t('conversation.threadCoordination.serverRequests.acceptForSession')}
                    </Button>
                    <Button
                      size='small'
                      status='danger'
                      loading={loading}
                      onClick={() =>
                        void resolve({
                          requestId: request.requestId,
                          response: { kind: 'permissions', decision: 'decline' },
                        })
                      }
                    >
                      {t('conversation.threadCoordination.serverRequests.decline')}
                    </Button>
                  </>
                )}
                {request.kind === 'user_input' && (
                  <Button
                    size='small'
                    type='primary'
                    loading={loading}
                    disabled={!answerCompleteness[request.requestId]}
                    onClick={() =>
                      void resolve({
                        requestId: request.requestId,
                        response: {
                          kind: 'user_input',
                          answers: Object.fromEntries(
                            request.questions.map((question) => [
                              question.id,
                              [answerFor(request.requestId, question.id).trim()],
                            ])
                          ),
                        },
                      })
                    }
                  >
                    {t('conversation.threadCoordination.serverRequests.submit')}
                  </Button>
                )}
                {request.kind === 'mcp_elicitation' && (
                  <>
                    <Button
                      size='small'
                      type='primary'
                      loading={loading}
                      onClick={() => {
                        try {
                          const content = JSON.parse(elicitationContent[request.requestId] ?? '{}') as unknown;
                          void resolve({
                            requestId: request.requestId,
                            response: { kind: 'mcp_elicitation', action: 'accept', content },
                          });
                        } catch {
                          Message.error(t('conversation.threadCoordination.serverRequests.invalidJson'));
                        }
                      }}
                    >
                      {t('conversation.threadCoordination.serverRequests.accept')}
                    </Button>
                    <Button
                      size='small'
                      status='danger'
                      loading={loading}
                      onClick={() =>
                        void resolve({
                          requestId: request.requestId,
                          response: { kind: 'mcp_elicitation', action: 'decline', content: null },
                        })
                      }
                    >
                      {t('conversation.threadCoordination.serverRequests.decline')}
                    </Button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};

export default PendingServerRequests;
