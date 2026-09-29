/*
 * LUK 角色酒馆 —— 人格注册表
 *
 * 以后新加人格只需要往 TAVERN_PERSONAS 里加一条，页面会自动多出一张卡片。
 * endpoint 指向同站反代（nginx location ^~ /tieba/ -> 上游），不要写上游真实地址，
 * 否则 HTTPS 页面会被混合内容拦截，也会暴露上游。
 */

export type TavernPersona = {
  /** 唯一 id，同时用作 React key */
  id: string
  /** 展示名 */
  name: string
  /** 卡片与面板上的 emoji */
  emoji: string
  /** 副标题 / 型号名 */
  title: string
  /** 一句话介绍 */
  desc: string
  /** 同站反代地址 */
  endpoint: string
  /** 上游模型名 */
  model: string
  /** 每局轮数 */
  rounds: number
}

export const TAVERN_PERSONAS: TavernPersona[] = [
  {
    id: 'tieba',
    name: '贴吧老哥',
    emoji: '🤡',
    title: '最强贴吧模型',
    desc: '嘴硬的贴吧老哥，给你 3 轮机会，试试能不能攻破它的人格。',
    endpoint: '/tieba/v1/chat/completions',
    model: 'local-model',
    rounds: 3,
  },
]
