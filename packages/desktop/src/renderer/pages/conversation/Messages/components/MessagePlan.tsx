import { Badge } from '@arco-design/web-react';
import { CheckOne, Down, RadioTwo, Right } from '@icon-park/react';
import React, { useState } from 'react';
import type { IMessagePlan } from '@/common/chat/chatLib';

const MessagePlan: React.FC<{ message: IMessagePlan }> = ({ message }) => {
  const [showMore, setShowMore] = useState(true);
  return (
    <div>
      <div
        className='flex items-center gap-10px text-t-secondary cursor-pointer'
        onClick={() => setShowMore(!showMore)}
      >
        <Badge status='default' text='To do list' className='![&_span.arco-badge-status-text]:text-t-secondary' />
        {showMore ? (
          <Down theme='outline' size='14' fill='currentColor' aria-hidden='true' />
        ) : (
          <Right theme='outline' size='14' fill='currentColor' aria-hidden='true' />
        )}
      </div>
      {showMore && (
        <div className='p-l-20px flex flex-col gap-8px pt-8px'>
          {message.content.entries.map((item, index) => {
            return (
              <div key={`${item.content}-${index}`} className='flex flex-row items-center text-t-secondary gap-8px'>
                {item.status === 'completed' ? (
                  <CheckOne
                    theme='outline'
                    size='22'
                    strokeWidth={4}
                    fill='currentColor'
                    className='flex text-success-6'
                    aria-hidden='true'
                  />
                ) : (
                  <RadioTwo
                    theme='outline'
                    size='22'
                    fill='currentColor'
                    className='flex text-t-tertiary'
                    aria-hidden='true'
                  />
                )}
                <span>{item.content} </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default MessagePlan;
