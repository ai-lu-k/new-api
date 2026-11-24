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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Dialog } from '@/components/dialog'
import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { Button } from '@/components/ui/button'
import { ComboboxInput } from '@/components/ui/combobox-input'
import { Field, FieldLabel } from '@/components/ui/field'
import { handleServerError } from '@/lib/handle-server-error'

import {
  benchmarkMappingsKey,
  getBenchmarkMappings,
  saveBenchmarkMapping,
} from '../../benchmark-api'
import { BenchmarkMappingEditor } from './benchmark-mapping-editor'

export function BenchmarkMappingsDialog(props: {
  modelName?: string
  onClose: () => void
}) {
  const { t } = useTranslation()
  const client = useQueryClient()
  const [selection, setSelection] = useState<string | null>(null)
  const query = useQuery({
    queryKey: benchmarkMappingsKey,
    queryFn: getBenchmarkMappings,
    refetchOnWindowFocus: false,
    meta: { errorToast: false },
  })
  const data = query.data
  const initial = props.modelName
    ? data?.models.find((model) =>
        model.aliases.includes(props.modelName ?? '')
      )?.id
    : data?.models[0]?.id
  const selected = selection ?? initial ?? ''
  const model = data?.models.find((item) => item.id === selected)
  const save = useMutation({
    mutationFn: saveBenchmarkMapping,
    onSuccess: (updated, request) => {
      client.setQueryData(benchmarkMappingsKey, updated)
      void client.invalidateQueries({ queryKey: ['benchmark'] })
      setSelection(request.model?.id ?? null)
      toast.success(t('Saved successfully'))
    },
    onError: (error) => handleServerError(error),
  })

  return (
    <Dialog
      open
      showCloseButton={!save.isPending}
      onOpenChange={(open) => {
        if (!open && !save.isPending) props.onClose()
      }}
      title={t('Benchmark mappings')}
      description={t(
        'Associate exact model names with benchmark evaluations. Changes apply immediately; scores update automatically.'
      )}
      contentHeight='min(65vh, 640px)'
      footer={
        <Button
          variant='outline'
          disabled={save.isPending}
          onClick={props.onClose}
        >
          {t('Close')}
        </Button>
      }
    >
      {query.isPending && <LoadingState />}
      {query.isError && <ErrorState onRetry={() => void query.refetch()} />}
      {data && (
        <div className='space-y-5'>
          <Field>
            <FieldLabel htmlFor='benchmark-mapping-selection'>
              {t('Benchmark model')}
            </FieldLabel>
            <ComboboxInput
              id='benchmark-mapping-selection'
              value={selected}
              options={data.models.map((item) => ({
                value: item.id,
                label: item.id,
              }))}
              onValueChange={setSelection}
              disabled={save.isPending}
              placeholder={t('Select a model')}
            />
          </Field>
          <div className='flex flex-wrap gap-2'>
            <Button
              variant='outline'
              size='sm'
              disabled={save.isPending}
              onClick={() => setSelection('')}
            >
              {t('Add mapping')}
            </Button>
            <Button
              variant='outline'
              size='sm'
              disabled={save.isPending || query.isFetching}
              onClick={() => void query.refetch()}
            >
              {t('Reload')}
            </Button>
          </div>
          <BenchmarkMappingEditor
            key={`${data.revision}:${selected}`}
            model={model}
            modelName={props.modelName}
            sources={data.sources}
            pending={save.isPending}
            onSave={(value) =>
              save.mutate({ revision: data.revision, model: value })
            }
            onDelete={
              model
                ? () =>
                    save.mutate({
                      revision: data.revision,
                      delete_id: model.id,
                    })
                : undefined
            }
          />
        </div>
      )}
    </Dialog>
  )
}
