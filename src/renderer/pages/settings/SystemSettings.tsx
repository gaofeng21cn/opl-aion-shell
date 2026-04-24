/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Button, Card, Grid, Space, Tag, Typography } from '@arco-design/web-react';
import { CheckOne, Repair, UpdateRotation } from '@icon-park/react';
import masLogo from '@/renderer/assets/logos/opl-modules/mas.svg';
import mdsLogo from '@/renderer/assets/logos/opl-modules/mds.svg';
import magLogo from '@/renderer/assets/logos/opl-modules/mag.svg';
import rcaLogo from '@/renderer/assets/logos/opl-modules/rca.svg';
import { useLocation } from 'react-router-dom';
import SystemModalContent from '@/renderer/components/settings/SettingsModal/contents/SystemModalContent';
import AboutModalContent from '@/renderer/components/settings/SettingsModal/contents/AboutModalContent';
import SettingsPageWrapper from './components/SettingsPageWrapper';

const OPL_ENVIRONMENT_ITEMS = [
  { id: 'codex', name: 'Codex CLI', role: '核心执行环境', status: '由 opl install 安装或复用' },
  { id: 'hermes', name: 'Hermes-Agent', role: '长任务与服务依赖', status: '由 opl install 安装或复用' },
  { id: 'mas', name: 'MAS', role: '医学研究模块', status: '安装 / 更新 / 修复', logo: masLogo },
  { id: 'mds', name: 'MDS', role: 'MAS 深度研究依赖', status: '安装 / 更新 / 修复', logo: mdsLogo },
  { id: 'mag', name: 'MAG', role: '基金申请模块', status: '安装 / 更新 / 修复', logo: magLogo },
  { id: 'rca', name: 'RCA', role: '汇报与幻灯片模块', status: '安装 / 更新 / 修复', logo: rcaLogo },
  { id: 'api', name: 'Product API', role: '本地 Web/API 服务', status: '默认 http://127.0.0.1:8787/' },
  { id: 'gui', name: 'One Person Lab App', role: '桌面图形界面', status: '检查发布包与本机安装' },
];

const OplEnvironmentContent: React.FC = () => (
  <div className='flex flex-col gap-16px'>
    <div>
      <Typography.Title heading={4} className='mb-6px'>
        One Person Lab 环境
      </Typography.Title>
      <Typography.Text className='text-t-secondary'>
        管理 One Person Lab 运行依赖、MAS/MDS/MAG/RCA 模组、Codex skills、本地 Product API service 和桌面 App。
      </Typography.Text>
    </div>

    <Card bordered className='rounded-xl'>
      <div className='flex flex-col gap-12px'>
        <Typography.Text className='font-600 text-t-primary'>一键维护</Typography.Text>
        <Typography.Text className='text-t-secondary'>
          后续这里会直接执行 `opl install`、`opl doctor`、模组更新和环境修复，并显示真实日志。当前版本先固定管理对象与入口结构。
        </Typography.Text>
        <Space wrap>
          <Button type='primary' icon={<CheckOne theme='outline' />} disabled>
            检查环境
          </Button>
          <Button icon={<UpdateRotation theme='outline' />} disabled>
            更新 One Person Lab / 模组
          </Button>
          <Button icon={<Repair theme='outline' />} disabled>
            修复安装
          </Button>
        </Space>
      </div>
    </Card>

    <Grid.Row gutter={[12, 12]}>
      {OPL_ENVIRONMENT_ITEMS.map((item) => (
        <Grid.Col key={item.id} xs={24} sm={12} md={12} lg={8}>
          <Card bordered className='rounded-xl h-full'>
            <div className='flex items-start gap-10px'>
              {item.logo ? (
                <img src={item.logo} alt='' width={28} height={28} className='shrink-0 rd-6px' />
              ) : (
                <div className='w-28px h-28px shrink-0 rd-6px bg-fill-2 flex items-center justify-center text-12px font-700'>
                  {item.name.slice(0, 2)}
                </div>
              )}
              <div className='min-w-0 flex-1'>
                <div className='flex items-center gap-8px flex-wrap'>
                  <Typography.Text className='font-600 text-t-primary'>{item.name}</Typography.Text>
                  <Tag size='small' color='arcoblue'>OPL managed</Tag>
                </div>
                <Typography.Paragraph className='text-13px text-t-secondary mt-4px mb-0'>
                  {item.role}
                </Typography.Paragraph>
                <Typography.Paragraph className='text-12px text-t-tertiary mt-6px mb-0'>
                  {item.status}
                </Typography.Paragraph>
              </div>
            </div>
          </Card>
        </Grid.Col>
      ))}
    </Grid.Row>
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
