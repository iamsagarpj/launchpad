import BracesIcon from '../components/icons/BracesIcon.jsx';
import Base64Icon from '../components/icons/Base64Icon.jsx';
import UuidIcon from '../components/icons/UuidIcon.jsx';
import LinkIcon from '../components/icons/LinkIcon.jsx';
import JwtIcon from '../components/icons/JwtIcon.jsx';
import HashIcon from '../components/icons/HashIcon.jsx';
import ClockIcon from '../components/icons/ClockIcon.jsx';
import RegexIcon from '../components/icons/RegexIcon.jsx';
import DiffIcon from '../components/icons/DiffIcon.jsx';
import XmlIcon from '../components/icons/XmlIcon.jsx';
import YamlIcon from '../components/icons/YamlIcon.jsx';
import ApiIcon from '../components/icons/ApiIcon.jsx';
import EnvFileIcon from '../components/icons/EnvFileIcon.jsx';
import LogIcon from '../components/icons/LogIcon.jsx';
import OpenApiIcon from '../components/icons/OpenApiIcon.jsx';
import CurlCleanerIcon from '../components/icons/CurlCleanerIcon.jsx';
import JsonViewerPage from '../pages/JsonViewerPage.jsx';
import Base64Page from '../pages/Base64Page.jsx';
import UuidPage from '../pages/UuidPage.jsx';
import UrlEncoderPage from '../pages/UrlEncoderPage.jsx';
import JwtDecoderPage from '../pages/JwtDecoderPage.jsx';
import HashGeneratorPage from '../pages/HashGeneratorPage.jsx';
import TimestampConverterPage from '../pages/TimestampConverterPage.jsx';
import RegexTesterPage from '../pages/RegexTesterPage.jsx';
import TextDiffPage from '../pages/TextDiffPage.jsx';
import XmlToolPage from '../pages/XmlToolPage.jsx';
import YamlToolPage from '../pages/YamlToolPage.jsx';
import ApiClientPage from '../pages/ApiClientPage.jsx';
import EnvFileToolPage from '../pages/EnvFileToolPage.jsx';
import LogViewerPage from '../pages/LogViewerPage.jsx';
import OpenApiViewerPage from '../pages/OpenApiViewerPage.jsx';
import CurlCleanerPage from '../pages/CurlCleanerPage.jsx';
import { TOOL_METADATA } from './registryData.js';

// Keyed by id (not array position) so TOOL_METADATA and this binding map can
// be edited independently without silently drifting out of sync.
const BINDINGS = {
  json: { Icon: BracesIcon, Component: JsonViewerPage },
  base64: { Icon: Base64Icon, Component: Base64Page },
  uuid: { Icon: UuidIcon, Component: UuidPage },
  'url-encoder': { Icon: LinkIcon, Component: UrlEncoderPage },
  jwt: { Icon: JwtIcon, Component: JwtDecoderPage },
  hash: { Icon: HashIcon, Component: HashGeneratorPage },
  timestamp: { Icon: ClockIcon, Component: TimestampConverterPage },
  regex: { Icon: RegexIcon, Component: RegexTesterPage },
  'text-diff': { Icon: DiffIcon, Component: TextDiffPage },
  xml: { Icon: XmlIcon, Component: XmlToolPage },
  yaml: { Icon: YamlIcon, Component: YamlToolPage },
  'api-client': { Icon: ApiIcon, Component: ApiClientPage },
  'curl-cleaner': { Icon: CurlCleanerIcon, Component: CurlCleanerPage },
  'env-file': { Icon: EnvFileIcon, Component: EnvFileToolPage },
  'log-viewer': { Icon: LogIcon, Component: LogViewerPage },
  openapi: { Icon: OpenApiIcon, Component: OpenApiViewerPage },
};

export const TOOLS = TOOL_METADATA.map((meta) => {
  const binding = BINDINGS[meta.id];
  if (!binding) {
    throw new Error(`tools/registry.js: no Icon/Component binding registered for tool id "${meta.id}"`);
  }
  return { ...meta, ...binding };
});
