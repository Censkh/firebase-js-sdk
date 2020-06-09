/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { BrowserPlatform } from '../platform_browser/browser_platform';
import { validateLooksLikeBase64 } from '../platform/platform';

export class ReactNativePlatform extends BrowserPlatform {
  base64Available = true;

  atob(encoded: string): string {
    validateLooksLikeBase64(encoded);
    return new Buffer(encoded, 'base64').toString('binary');
  }

  btoa(raw: string): string {
    return new Buffer(raw, 'binary').toString('base64');
  }
}
