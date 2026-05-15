import React from 'react';
import { Typography } from '@arco-design/web-react';

type SettingRowProps = {
  title: string;
  description?: string;
  children: React.ReactNode;
  alignTop?: boolean;
};

const SettingRow: React.FC<SettingRowProps> = ({ title, description, children, alignTop = false }) => {
  return (
    <div
      className={`flex flex-col gap-12px px-16px py-14px md:grid md:grid-cols-[220px_minmax(280px,400px)] lg:grid-cols-[240px_minmax(300px,420px)] md:justify-start md:gap-28px ${alignTop ? 'md:items-start' : 'md:items-center'}`}
    >
      <div className='min-w-0'>
        <Typography.Text className='block text-14px font-500 text-t-primary'>{title}</Typography.Text>
        {description && (
          <Typography.Text className='block text-12px text-t-secondary mt-3px'>{description}</Typography.Text>
        )}
      </div>
      <div className='min-w-0'>{children}</div>
    </div>
  );
};

export default SettingRow;
