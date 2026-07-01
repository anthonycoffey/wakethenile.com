// Object types
import {seo} from './objects/seo'
import {blockContent} from './objects/blockContent'
import {fullScreenSection} from './objects/fullScreenSection'
import {socialLink} from './objects/socialLink'

// Document types
import {siteSettings} from './documents/siteSettings'
import {page} from './documents/page'
import {post} from './documents/post'
import {show} from './documents/show'
import {video} from './documents/video'
import {release} from './documents/release'
import {product} from './documents/product'
import {order} from './documents/order'
import {commerceSettings} from './documents/commerceSettings'

export const schemaTypes = [
  // objects
  seo,
  blockContent,
  fullScreenSection,
  socialLink,
  // documents
  siteSettings,
  page,
  post,
  show,
  video,
  release,
  product,
  order,
  commerceSettings,
]
