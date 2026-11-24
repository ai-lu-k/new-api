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
import { useQuery } from '@tanstack/react-query'

import { api } from '@/lib/api'
import { requireServerSuccess } from '@/lib/server-error-message'

interface RegistrationRisk {
  required: boolean
  verified: boolean
  available: boolean
}

export function useRegistrationRisk() {
  return useQuery({
    queryKey: ['registration-risk'],
    queryFn: async () => {
      const response = await api.get('/api/user/registration-device')
      return requireServerSuccess(response.data).data as RegistrationRisk
    },
    staleTime: 0,
  })
}
