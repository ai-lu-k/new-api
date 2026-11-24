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
import type { SetupModel } from './agents'

/** The request format an example is written in. */
export type ApiStyle = 'openai' | 'anthropic'

export type ApiLanguage = 'curl' | 'python' | 'node' | 'go' | 'java'

/** The languages examples are given in, in the order they are offered. */
export const API_LANGUAGES: { id: ApiLanguage; label: string }[] = [
  { id: 'curl', label: 'cURL' },
  { id: 'python', label: 'Python' },
  { id: 'node', label: 'Node.js' },
  { id: 'go', label: 'Go' },
  { id: 'java', label: 'Java' },
]

type ApiExampleInput = {
  language: ApiLanguage
  style: ApiStyle
  /** The gateway's public address, without a path. */
  address: string
  apiKey: string
  model: string
}

/** The models that can be called with one of the two example formats. */
export function callableModels(models: SetupModel[]): SetupModel[] {
  return models.filter(
    (model) =>
      model.protocols.includes('openai-completions') ||
      model.protocols.includes('anthropic-messages')
  )
}

/**
 * The format to show for a model: the OpenAI-compatible one wherever the
 * gateway serves the model on it, since most code already speaks it.
 */
export function apiStyleOf(model: SetupModel | undefined): ApiStyle {
  return model && !model.protocols.includes('openai-completions')
    ? 'anthropic'
    : 'openai'
}

function origin(address: string): string {
  return address.replace(/\/+$/, '')
}

/** The base URL an SDK of this format is pointed at. */
export function apiBaseUrl(style: ApiStyle, address: string): string {
  // The Anthropic SDKs add /v1/messages themselves.
  return style === 'openai' ? `${origin(address)}/v1` : origin(address)
}

const PROMPT = 'Hello!'
// The Messages API will not answer without an output limit.
const MAX_TOKENS = 1024

function requestBody(style: ApiStyle, model: string, indent: string): string {
  const lines = [
    `"model": ${JSON.stringify(model)},`,
    ...(style === 'anthropic' ? [`"max_tokens": ${MAX_TOKENS},`] : []),
    `"messages": [{"role": "user", "content": "${PROMPT}"}]`,
  ]
  return lines.map((line) => indent + line).join('\n')
}

function endpoint(style: ApiStyle, address: string): string {
  return `${origin(address)}${style === 'openai' ? '/v1/chat/completions' : '/v1/messages'}`
}

/** The headers a raw HTTP request needs, as [name, value] pairs. */
function headers(style: ApiStyle, apiKey: string): [string, string][] {
  return style === 'openai'
    ? [
        ['Content-Type', 'application/json'],
        ['Authorization', `Bearer ${apiKey}`],
      ]
    : [
        ['Content-Type', 'application/json'],
        ['x-api-key', apiKey],
        ['anthropic-version', '2023-06-01'],
      ]
}

function curl(input: ApiExampleInput): string {
  return [
    `curl ${endpoint(input.style, input.address)} \\`,
    ...headers(input.style, input.apiKey).map(
      ([name, value]) => `  -H "${name}: ${value}" \\`
    ),
    `  -d '{`,
    requestBody(input.style, input.model, '    '),
    `  }'`,
  ].join('\n')
}

function python(input: ApiExampleInput): string {
  const base = apiBaseUrl(input.style, input.address)
  if (input.style === 'openai') {
    return `# pip install openai
from openai import OpenAI

client = OpenAI(
    base_url=${JSON.stringify(base)},
    api_key=${JSON.stringify(input.apiKey)},
)

response = client.chat.completions.create(
    model=${JSON.stringify(input.model)},
    messages=[{"role": "user", "content": "${PROMPT}"}],
)
print(response.choices[0].message.content)`
  }
  return `# pip install anthropic
from anthropic import Anthropic

client = Anthropic(
    base_url=${JSON.stringify(base)},
    api_key=${JSON.stringify(input.apiKey)},
)

message = client.messages.create(
    model=${JSON.stringify(input.model)},
    max_tokens=${MAX_TOKENS},
    messages=[{"role": "user", "content": "${PROMPT}"}],
)
for block in message.content:
    if block.type == "text":
        print(block.text)`
}

function node(input: ApiExampleInput): string {
  const base = apiBaseUrl(input.style, input.address)
  if (input.style === 'openai') {
    return `// npm install openai   (save as chat.mjs, run with: node chat.mjs)
import OpenAI from 'openai'

const client = new OpenAI({
  baseURL: ${JSON.stringify(base)},
  apiKey: ${JSON.stringify(input.apiKey)},
})

const response = await client.chat.completions.create({
  model: ${JSON.stringify(input.model)},
  messages: [{ role: 'user', content: '${PROMPT}' }],
})
console.log(response.choices[0].message.content)`
  }
  return `// npm install @anthropic-ai/sdk   (save as chat.mjs, run with: node chat.mjs)
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({
  baseURL: ${JSON.stringify(base)},
  apiKey: ${JSON.stringify(input.apiKey)},
})

const message = await client.messages.create({
  model: ${JSON.stringify(input.model)},
  max_tokens: ${MAX_TOKENS},
  messages: [{ role: 'user', content: '${PROMPT}' }],
})
for (const block of message.content) {
  if (block.type === 'text') console.log(block.text)
}`
}

function go(input: ApiExampleInput): string {
  return `package main

import (
	"bytes"
	"fmt"
	"io"
	"net/http"
)

func main() {
	body := []byte(\`{
${requestBody(input.style, input.model, '  ')}
}\`)
	req, err := http.NewRequest("POST", ${JSON.stringify(endpoint(input.style, input.address))}, bytes.NewReader(body))
	if err != nil {
		panic(err)
	}
${headers(input.style, input.apiKey)
  .map(
    ([name, value]) =>
      `\treq.Header.Set(${JSON.stringify(name)}, ${JSON.stringify(value)})`
  )
  .join('\n')}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		panic(err)
	}
	defer resp.Body.Close()

	answer, err := io.ReadAll(resp.Body)
	if err != nil {
		panic(err)
	}
	fmt.Println(string(answer))
}`
}

function java(input: ApiExampleInput): string {
  const json = [
    `{"model": ${JSON.stringify(input.model)}, `,
    input.style === 'anthropic' ? `"max_tokens": ${MAX_TOKENS}, ` : '',
    `"messages": [{"role": "user", "content": "${PROMPT}"}]}`,
  ].join('')
  return `import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

public class Chat {
    public static void main(String[] args) throws Exception {
        // A JSON string literal is written the same way in Java.
        String body = ${JSON.stringify(json)};

        HttpRequest request = HttpRequest.newBuilder()
            .uri(URI.create(${JSON.stringify(endpoint(input.style, input.address))}))
${headers(input.style, input.apiKey)
  .map(
    ([name, value]) =>
      `            .header(${JSON.stringify(name)}, ${JSON.stringify(value)})`
  )
  .join('\n')}
            .POST(HttpRequest.BodyPublishers.ofString(body))
            .build();

        HttpResponse<String> response = HttpClient.newHttpClient()
            .send(request, HttpResponse.BodyHandlers.ofString());
        System.out.println(response.body());
    }
}`
}

const BUILDERS: Record<ApiLanguage, (input: ApiExampleInput) => string> = {
  curl,
  python,
  node,
  go,
  java,
}

/**
 * A complete, runnable request to the gateway in one language. The raw HTTP
 * examples (cURL, Go, Java) need nothing installed; Python and Node.js use the
 * vendor SDK of the format, pointed at the gateway.
 */
export function buildApiExample(input: ApiExampleInput): string {
  return BUILDERS[input.language](input)
}
