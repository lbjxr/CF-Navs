import { Hono } from 'hono'
import type { Context } from 'hono'
import { ErrCode, type BatchDeleteReq, type CategorySortReq, type CategoryUpsertReq } from '../../shared/types'
import {
  CategoryConflictError,
  CategoryValidationError,
  createCategory,
  deleteCategory,
  batchDeleteCategories,
  listCategories,
  sortCategories,
  touchDataVersion,
  updateCategory,
} from '../lib/db'
import { invalidatePublicDataCache } from '../lib/cache'
import { fail, ok } from '../lib/response'
import { invalidateRuntimeDataCache } from '../lib/runtimeCache'
import type { HonoEnv } from '../types'

type AppContext = Context<HonoEnv>

function badRequest(c: AppContext, msg: string) {
  return c.json(fail(ErrCode.BAD_REQUEST, msg))
}

function parseId(c: AppContext): number | null {
  const id = Number(c.req.param('id'))
  return Number.isInteger(id) && id > 0 ? id : null
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isOptionalString(value: unknown): value is string | null | undefined {
  return value === undefined || value === null || typeof value === 'string'
}

function parseParentId(value: unknown): number | null | undefined {
  if (value === undefined) return undefined
  if (value === null) return null
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : undefined
}

function parseBatchIds(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 500) return null
  const ids = [...new Set(value)]
  return ids.length > 0 && ids.every((id) => Number.isInteger(id) && id > 0) ? ids as number[] : null
}

async function readJson<T>(c: AppContext): Promise<T | null> {
  try {
    return await c.req.json<T>()
  } catch {
    return null
  }
}

export const categoriesRoutes = new Hono<HonoEnv>()

function categoryWriteError(c: AppContext, error: unknown, fallback: string) {
  if (error instanceof CategoryValidationError) return badRequest(c, error.message)
  if (error instanceof CategoryConflictError) return c.json(fail(ErrCode.CONFLICT, error.message))
  return c.json(fail(ErrCode.SERVER_ERROR, fallback))
}

categoriesRoutes.get('/', async (c) => {
  try {
    return c.json(ok(await listCategories(c.env.DB)))
  } catch {
    return c.json(fail(ErrCode.SERVER_ERROR, 'failed to list categories'))
  }
})

categoriesRoutes.post('/', async (c) => {
  const body = await readJson<CategoryUpsertReq>(c)
  const parentId = parseParentId(body?.parent_id)
  if (!body || !isNonEmptyString(body.title) || !isOptionalString(body.icon) || (body.parent_id !== undefined && parentId === undefined)) {
    return badRequest(c, 'invalid category payload')
  }

  try {
    const category = await createCategory(c.env.DB, {
      title: body.title.trim(),
      icon: body.icon ?? null,
      parent_id: parentId ?? null,
    })
    await touchDataVersion(c.env.DB)
    invalidateRuntimeDataCache()
    invalidatePublicDataCache(c, c.req.url)
    return c.json(ok(category))
  } catch (error) {
    return categoryWriteError(c, error, 'failed to create category')
  }
})

categoriesRoutes.put('/:id', async (c) => {
  const id = parseId(c)
  if (id == null) return badRequest(c, 'invalid category id')

  const body = await readJson<CategoryUpsertReq>(c)
  const parentId = parseParentId(body?.parent_id)
  if (!body || !isNonEmptyString(body.title) || !isOptionalString(body.icon) || (body.parent_id !== undefined && parentId === undefined)) {
    return badRequest(c, 'invalid category payload')
  }

  try {
    const category = await updateCategory(c.env.DB, id, {
      title: body.title.trim(),
      icon: body.icon ?? null,
      parent_id: body.parent_id === undefined ? undefined : parentId,
    })
    if (!category) return c.json(fail(ErrCode.NOT_FOUND, 'category not found'))
    await touchDataVersion(c.env.DB)
    invalidateRuntimeDataCache()
    invalidatePublicDataCache(c, c.req.url)
    return c.json(ok(category))
  } catch (error) {
    return categoryWriteError(c, error, 'failed to update category')
  }
})

categoriesRoutes.delete('/:id', async (c) => {
  const id = parseId(c)
  if (id == null) return badRequest(c, 'invalid category id')

  try {
    const deleted = await deleteCategory(c.env.DB, id)
    if (!deleted) return c.json(fail(ErrCode.NOT_FOUND, 'category not found'))
    await touchDataVersion(c.env.DB)
    invalidateRuntimeDataCache()
    invalidatePublicDataCache(c, c.req.url)
    return c.json(ok(null))
  } catch (error) {
    return categoryWriteError(c, error, 'failed to delete category')
  }
})

categoriesRoutes.post('/batch-delete', async (c) => {
  const body = await readJson<BatchDeleteReq>(c)
  const ids = parseBatchIds(body?.ids)
  if (!ids) return badRequest(c, 'invalid batch delete payload')
  try {
    const result = await batchDeleteCategories(c.env.DB, ids)
    if (result.deleted > 0 || result.deleted_bookmarks > 0) {
      await touchDataVersion(c.env.DB)
      invalidateRuntimeDataCache()
      invalidatePublicDataCache(c, c.req.url)
    }
    return c.json(ok(result))
  } catch (error) {
    return categoryWriteError(c, error, 'failed to batch delete categories')
  }
})

categoriesRoutes.post('/sort', async (c) => {
  const body = await readJson<CategorySortReq>(c)
  const ids = body?.ids
  const parentId = parseParentId(body?.parent_id)
  if (!Array.isArray(ids) || !ids.every((id) => Number.isInteger(id) && id > 0) || parentId === undefined) {
    return badRequest(c, 'invalid sort payload')
  }

  try {
    await sortCategories(c.env.DB, { parent_id: parentId, ids })
    await touchDataVersion(c.env.DB)
    invalidateRuntimeDataCache()
    invalidatePublicDataCache(c, c.req.url)
    return c.json(ok(null))
  } catch (error) {
    return categoryWriteError(c, error, 'failed to sort categories')
  }
})

export default categoriesRoutes
