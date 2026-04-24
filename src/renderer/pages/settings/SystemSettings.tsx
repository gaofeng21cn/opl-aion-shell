/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Button, Card, Space, Typography } from '@arco-design/web-react';
import { CheckOne, Repair, UpdateRotation } from '@icon-park/react';
import { useLocation } from 'react-router-dom';
import SystemModalContent from '@/renderer/components/settings/SettingsModal/contents/SystemModalContent';
import AboutModalContent from '@/renderer/components/settings/SettingsModal/contents/AboutModalContent';
import SettingsPageWrapper from './components/SettingsPageWrapper';

const OplEnvironmentContent: React.FC = () => (
  <div className='flex flex-col gap-16px'>
    <div>
      <Typography.Title heading={4} className='mb-6px'>
        OPL 环境
      </Typography.Title>
      <Typography.Text className='text-t-secondary'>
        管理 OPL 运行依赖、MAS/MAG/RCA 模组、Codex skills、本地 Product API service 和桌面 GUI。
      </Typography.Text>
    </div>

    <Card bordered className='rounded-xl'>
      <div className='flex flex-col gap-12px'>
        <Typography.Text className='font-600 text-t-primary'>一键维护</Typography.Text>
        <Typography.Text className='text-t-secondary'>
          这里会承载 `opl install`、`opl doctor`、模组更新和环境修复。当前版本先固定入口与产品结构，后续接入真实执行状态与日志。
        </Typography.Text>
        <Space wrap>
          <Button type='primary' icon={<CheckOne theme='outline' />} disabled>
            检查环境
          </Button>
          <Button icon={<UpdateRotation theme='outline' />} disabled>
            更新 OPL / 模组
          </Button>
          <Button icon={<Repair theme='outline' />} disabled>
            修复安装
          </Button>
        </Space>
      </div>
    </Card>
  </div>
);

const SystemSettings: React.FC = () => {
  const location = useLocation();
  const isAboutPage = location.pathname === '/settings/about';
  const isOplPage = location.pathname === '/settings/opl';

  return (
    <SettingsPageWrapper contentClassName={isAboutPage ? 'max-w-640px' : isOplPage ? 'max-w-720px' : undefined}>
      {isAboutPage ? <AboutModalContent /> : isOplPage ? <OplEnvironmentContent /> : <SystemModalContent />}
    </SettingsPageWrapper>
  );
};

export default SystemSettings;
