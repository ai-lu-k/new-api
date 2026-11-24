/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
/*
 * DSH 手动接入步骤 —— 从教程页拆出来，供「快速开始」里的 DSH 一栏和 /guide 共用。
 *
 * 文案直接写中文（站点是中文站），不铺 i18n 键。
 * 模型名只是示例（以 DeepSeek-V4.1-Flash 为例）。
 */
import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'

import { useSiteEndpoints } from '@/hooks/use-site-endpoints'
import { textActionClass } from '@/lib/text-action'

const EXAMPLE_MODEL = 'deepseek/deepseek-v4.1-flash'
const PROVIDER_ID = 'new-api'

function C({ children }: { children: string }) {
  return (
    <code className='bg-muted rounded px-1.5 py-0.5 font-mono text-[12px]'>
      {children}
    </code>
  )
}

function Pre({ children }: { children: string }) {
  return (
    <div className='relative mt-3'>
      <pre className='bg-muted/60 border-border overflow-x-auto rounded-lg border p-3 text-[12.5px] leading-relaxed'>
        <code className='font-mono whitespace-pre'>{children}</code>
      </pre>
      {/* A right-edge fade says the line continues past the screen, since the
          block scrolls sideways on a phone. */}
      <span
        aria-hidden='true'
        className='from-muted/95 pointer-events-none absolute inset-y-2 right-2 w-8 rounded-r bg-gradient-to-l to-transparent md:hidden'
      />
    </div>
  )
}

function Step({
  index,
  title,
  children,
}: {
  index: string
  title: string
  children: ReactNode
}) {
  return (
    <section className='mt-9'>
      <h2 className='flex items-center gap-2 text-lg font-semibold tracking-tight'>
        <span className='bg-primary text-primary-foreground flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold'>
          {index}
        </span>
        {title}
      </h2>
      <div className='text-muted-foreground mt-3 text-sm leading-relaxed'>
        {children}
      </div>
    </section>
  )
}

export function DshManualSteps() {
  const endpoints = useSiteEndpoints()

  return (
    <>
      <Step index='1' title='拿一枚 API Key'>
        <ol className='list-decimal space-y-1.5 pl-5'>
          <li>
            登录后进{' '}
            <Link to='/dashboard' className={textActionClass}>
              控制台
            </Link>
            ，左侧点「API 密钥」。
          </li>
          <li>
            点「<strong>创建 API 密钥</strong>」，填名称（随便写），
            <strong>分组</strong>选你要用的那一个——没有特殊需求就用默认的。
          </li>
          <li>
            额度、模型限制保持默认，保存后复制生成的 <C>sk-…</C>
            ——只显示一次，存好。
          </li>
        </ol>
      </Step>

      <Step index='2' title='在客户端里填三个值'>
        <div className='border-border overflow-hidden rounded-lg border'>
          <table className='w-full text-left text-sm'>
            <tbody>
              <tr className='border-border border-b'>
                <th className='w-24 px-3 py-2 font-medium'>接口地址</th>
                <td className='px-3 py-2'>
                  <C>{endpoints.base}</C>
                </td>
              </tr>
              <tr className='border-border border-b'>
                <th className='px-3 py-2 font-medium'>API 密钥</th>
                <td className='px-3 py-2'>
                  <C>sk-…</C> 来自第 1 步
                </td>
              </tr>
              <tr>
                <th className='px-3 py-2 font-medium'>模型名</th>
                <td className='px-3 py-2'>
                  <C>{EXAMPLE_MODEL}</C>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className='mt-4'>
          以 DSH 为例：设置 → 模型 → 添加自定义提供方，Provider ID 填{' '}
          <C>{PROVIDER_ID}</C>，地址填 <C>{endpoints.base}</C>，协议选{' '}
          <C>openai-completions</C>，模型目录加上上面的模型名，然后创建。
        </p>
        <p className='mt-3'>
          表单里只需要这四处：<strong>Provider ID</strong> 填{' '}
          <C>{PROVIDER_ID}</C>、<strong>API 地址</strong>填{' '}
          <C>{endpoints.base}</C>、<strong>协议</strong>选{' '}
          <C>openai-completions</C>、<strong>模型</strong>填上面的模型名；
          其它字段保持默认。
        </p>
      </Step>

      <Step index='3' title='开启图片输入、调大上下文'>
        <p>
          DSH 的模型页只开放「上下文窗口 / 最大输出 token」两个进阶字段，
          <strong>图片输入没有表单控件</strong>
          ：手填的模型默认按纯文本对待，贴图会在发送前被拒。两种改法：
        </p>

        <p className='text-foreground mt-5 font-medium'>
          方式一：改配置文件
          <span className='text-muted-foreground ml-2 font-normal'>
            ($DSH_HOME/settings.yaml，Windows 为
            C:\Users\你的用户名\.dsh\settings.yaml)
          </span>
        </p>
        <p className='mt-1'>
          找到 <C>llm-pi-ai.providers</C> 里你刚建的那一段，给模型加三行：
        </p>
        <Pre>{`llm-pi-ai:
  providers:
    ${PROVIDER_ID}:
      models:
        - id: ${EXAMPLE_MODEL}
          input: [text, image]      # 该模型接受图片
          contextWindow: 1000000    # 上下文窗口（token）
          maxTokens: 32768          # 单次输出上限`}</Pre>
        <p className='mt-2'>
          也可以只写一次路由级默认值
          <C>defaultInput</C> / <C>defaultContextWindow</C> /{' '}
          <C>defaultMaxTokens</C>
          ，对该提供方下所有手填模型生效。保存即生效，
          <strong>不用重启</strong>；之前贴图被拒的会话要新开一个。
        </p>

        <p className='text-foreground mt-5 font-medium'>
          方式二：把一句提示词丢给 agent
        </p>
        <Pre>{`帮我改 DSH 配置：打开 $DSH_HOME/settings.yaml，找到 llm-pi-ai.providers 里 baseURL 是 ${endpoints.base} 的提供方，给模型 ${EXAMPLE_MODEL} 加上 input: [text, image]、contextWindow: 1000000、maxTokens: 32768；其它内容别动，改完校验 YAML 并告诉我结论。`}</Pre>
      </Step>

      <Step index='4' title='排错'>
        <div className='border-border overflow-hidden rounded-lg border'>
          <table className='w-full text-left text-sm'>
            <tbody>
              <tr className='border-border border-b'>
                <th className='w-64 px-3 py-2 font-medium'>
                  MISSING_CREDENTIAL / 401
                </th>
                <td className='px-3 py-2'>
                  密钥没保存或没复制全，重新创建一枚。
                </td>
              </tr>
              <tr className='border-border border-b'>
                <th className='px-3 py-2 font-medium'>
                  UNKNOWN_MODEL / model_not_found
                </th>
                <td className='px-3 py-2'>
                  模型名拼错，或该模型在你的分组里没开通渠道。
                </td>
              </tr>
              <tr className='border-border border-b'>
                <th className='px-3 py-2 font-medium'>贴图被拒</th>
                <td className='px-3 py-2'>
                  模型没声明图片模态，见第 3 步，改完新开会话。
                </td>
              </tr>
              <tr>
                <th className='px-3 py-2 font-medium'>429</th>
                <td className='px-3 py-2'>请求太频繁，等几秒重试。</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Step>

      <p className='text-muted-foreground mt-10 text-xs'>
        还没有密钥？{' '}
        <Link to='/dashboard' className={textActionClass}>
          去控制台创建
        </Link>{' '}
        ·{' '}
        <Link to='/pricing' className={textActionClass}>
          模型价格
        </Link>
      </p>
    </>
  )
}
