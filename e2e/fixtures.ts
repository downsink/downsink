import {mkdtemp, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {test as base, webkit} from '@playwright/test'

/**
 * WebKit denies OPFS in ephemeral browsing contexts (same behavior as Safari
 * private windows): navigator.storage.getDirectory() rejects with
 * UnknownError. Playwright's default contexts are ephemeral, so WebKit tests
 * run in a persistent context backed by a throwaway profile dir.
 */
export const it = base.extend({
  context: async ({browserName, context}, use) => {
    if (browserName !== 'webkit') {
      await use(context)
      return
    }
    const profile = await mkdtemp(join(tmpdir(), 'downsink-webkit-'))
    const persistent = await webkit.launchPersistentContext(profile)
    await use(persistent)
    await persistent.close()
    await rm(profile, {recursive: true, force: true})
  },
})

export {expect} from '@playwright/test'
