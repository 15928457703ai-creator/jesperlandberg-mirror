"""Single source of truth for the locally added portfolio projects.

Two different orders live here:
  * DISPLAY_ORDER -> relative order of the local projects in data.projects,
    the /full catalogue, sitemap and markdown.
  * HOME_ORDER    -> the COMPLETE 16-item permutation of the home card strip;
    this also drives home.featured in every payload / the GraphQL replay and
    the detail-page prev/next ring. See the notes next to HOME_ORDER.
"""
import json, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOCAL = "http://127.0.0.1:__PORT__"

RULES = [
    ("https://graphql.datocms.com/", LOCAL + "/__graphql"),
    ("https://graphql.datocms.com", LOCAL + "/__graphql"),
    ("https://static.cloudflareinsights.com", LOCAL + "/__noop"),
    ("https://www.datocms-assets.com", LOCAL),
    ("https://image.mux.com", LOCAL),
    ("https://stream.mux.com", LOCAL),
    ("https://jesperlandberg.com", LOCAL),
    ("http://jesperlandberg.com", LOCAL),
]


def rw(s):
    for a, b in RULES:
        s = s.replace(a, b)
    return s


def rwobj(o):
    if isinstance(o, str):
        return rw(o)
    if isinstance(o, list):
        return [rwobj(x) for x in o]
    if isinstance(o, dict):
        return {k: rwobj(v) for k, v in o.items()}
    return o


def _meta(slug, path):
    return json.load(open(os.path.join(ROOT, path), encoding="utf-8"))


PROJECTS = [
    {
        "slug": "oppo-service",
        "title": "OPPO 服务小程序",
        "pid": "oppo-service-miniapp-2026",
        "dir": "oppo",
        "desc": "OPPO 服务小程序 UI 体验升级：从现状与目标出发重构信息架构，建立品牌色与设计系统，统一服务预约、门店查询与进度追踪等核心流程，关键指标提升 6.74× 与 4.89×。",
        "short": "OPPO 服务小程序 UI 体验升级，重构服务流程与品牌设计系统。",
        # A WeChat mini program has no public URL. The link pill opens a
        # local hint page and shows the same words on hover (local-copy.css).
        "link": "/oppo-wechat",
        "hint": "在微信顶部的搜索框中输入「OPPO服务」。",
        "tags": [("oppo-tag-ux", "UI / UX", None),
                 ("oppo-tag-brand", "OPPO", None),
                 ("oppo-tag-year", "2026", None)],
        # Animated HOME card cover.  The 7 layers in 首页动态视频制作/ are staged
        # in site/oppo-service-live.html, driven by one GSAP timeline and recorded
        # to live.mp4 by tools/record_oppo_service_live.js.  `home_cover`
        # overrides ONLY the payload's src/thumb/card/video, so the home card
        # paints the clip while the 18 detail slides / GraphQL media stay intact.
        "home_cover": {
            "main": {"file": "live.jpg", "width": 1600, "height": 900},
            "_small": {"file": "live_small.jpg", "width": 640, "height": 360},
            "_card": {"file": "live_card.jpg", "width": 1200, "height": 675},
            "video": {"file": "live.mp4", "width": 1600, "height": 900,
                      "duration": 12},
        },
        "meta": _meta("oppo-service", "raw/oppo_images.json"),
    },
    {
        "slug": "naivideo",
        "title": "Naivideo",
        "pid": "naivideo-app-2026",
        "dir": "naivideo",
        "desc": "Naivideo 海外 AI 创作工具：面向 AI 视频与音乐生成的一站式创作平台，以 AI Studio、AI Effects 与 Agent 创作打通从灵感到成片的完整链路，构建沉浸观看、社交裂变与资产全生命周期管理，并支持 PC 横向扩展与商业化闭环。",
        "short": "Naivideo 海外 AI 创作工具，AI 视频与音乐生成平台，覆盖 Agent 创作、沉浸观看与资产全生命周期管理。",
        "link": "https://www.piclumen.com/",
        "tags": [("naivideo-tag-ai", "AI / Video", None),
                 ("naivideo-tag-brand", "Naivideo", None),
                 ("naivideo-tag-year", "2026", None)],
        "meta": _meta("naivideo", "raw/project_images/naivideo.json"),
    },
    {
        "slug": "erp",
        "title": "ERP",
        "pid": "jinsha-erp-2026",
        "dir": "erp",
        "desc": "金沙白酒 ERP 1.0 制造业数字化：从 0 到 1 搭建移动端 ERP 体验，覆盖生产、采购、库存与仓库管理四大核心流程，为 60+ 工厂的仓管与操作员提供日常指令、入库与退货服务，解决办公场景转移下电脑无法移动的作业瓶颈。",
        "short": "金沙白酒 ERP 1.0，制造业数字化移动端 ERP 的主设 UX/UI 0-1 建设。",
        "tags": [("erp-tag-ux", "UX / UI", None),
                 ("erp-tag-brand", "ERP", None),
                 ("erp-tag-year", "2026", None)],
        # Animated HOME card cover.  The two phone slices from
        # `ERP/动画/` are staged on a rebuilt version of the artwork in
        # site/erp-fx.html, driven by one GSAP master timeline (14 s, seamless)
        # and recorded to cover.mp4 by tools/record_erp_fx.js.  `home_cover`
        # swaps ONLY the payload's src/thumb/card/video, so the home card plays
        # the clip while the 12 detail slides / GraphQL media are untouched.
        "home_cover": {
            "main": {"file": "cover.jpg", "width": 1600, "height": 900},
            "_small": {"file": "cover_small.jpg", "width": 640, "height": 360},
            "_card": {"file": "cover_card.jpg", "width": 1200, "height": 675},
            "video": {"file": "cover.mp4", "width": 1600, "height": 900,
                      "duration": 14},
        },
        "meta": _meta("erp", "raw/project_images/erp.json"),
    },
    {
        "slug": "oppo-self-service",
        "title": "OPPO自助服务",
        "pid": "oppo-self-service-2026",
        "dir": "oppo-self",
        "desc": "OPPO 自助服务大型项目落地多平台：覆盖国内版 my oppo、国际版 my oppo 与官网 PC 三端，重新搭建层级和场景清晰的服务框架，按账号管理、设备管理、问题场景、功能与内容重新组织服务信息，并针对各业务场景基于实际问题做优化补充，提升内容的易寻、易用性与交互成功率。",
        "short": "OPPO 自助服务多平台落地，重构服务框架与境内外 APP + PC 全场景体验。",
        "link": "https://support.oppo.com/cn/",
        # Tag pills are WebGL text meshes: the shipped MSDF atlas is Latin
        # only, so keep every tag in Latin characters or it renders blank.
        "tags": [("oppo-self-tag-ux", "UX / UI", None),
                 ("oppo-self-tag-brand", "OPPO Service", None),
                 ("oppo-self-tag-year", "2026", None)],
        # `封面.jpg` was added later as the FIRST slide of the detail sheet.
        # The home card cover must stay the originally requested `1.png`,
        # so the payload's src/thumb/card are read from this index while
        # `images[]` (and the sheet placeholders) follow the full meta order.
        "cover_index": 1,
        # Animated HOME card cover.  The four slices in `封面动画/` are staged
        # in site/oppo-self-live.html, driven by one GSAP timeline and recorded
        # to motion.mp4 by tools/record_oppo_self_live.js.  `home_cover`
        # overrides ONLY the payload's src/thumb/card/video, so the home card
        # paints the clip while the 17 detail slides / GraphQL media stay
        # exactly as they were.  See inject_all_data.py:inject_devalue.
        "home_cover": {
            "main": {"file": "motion.jpg", "width": 1600, "height": 900},
            "_small": {"file": "motion_small.jpg", "width": 640, "height": 360},
            "_card": {"file": "motion_card.jpg", "width": 1200, "height": 675},
            "video": {"file": "motion.mp4", "width": 1600, "height": 900,
                      "duration": 12},
        },
        "meta": _meta("oppo-self-service", "raw/project_images/oppo-self-service.json"),
    },
    {
        "slug": "csa-service",
        "title": "CSA客服服务",
        "pid": "csa-service-2026",
        "dir": "csa",
        "desc": "CSA 客户服务：基于 2022 年 OPPO 凤凰计划 G-CSM 重构，对 CSA 移动端内容与缺失场景做补充优化。面向服务顾问、维修工程师与网点主管，承载于 iPad mini 与 OPPO PAD，统一服务门户、提供一站式服务体验；补充用户到店取号与叫号、叫号大屏状态联动等场景，推广至 180+ 门店使用，取号大屏覆盖门店数提升至 500+。",
        "short": "CSA 客户服务，OPPO 凤凰计划 G-CSM 移动端重构，统一服务门户与到店取号体验。",
        "tags": [("csa-tag-ux", "UX / UI", None),
                 ("csa-tag-brand", "CSA", None),
                 ("csa-tag-year", "2026", None)],
        "meta": _meta("csa-service", "raw/project_images/csa-service.json"),
    },
    {
        "slug": "hengxiang-advantage",
        "title": "横向优势",
        "pid": "hengxiang-advantage-2026",
        "dir": "hengxiang",
        "desc": "横向优势：以视觉表现为核心的能力横向拓展，覆盖插画、3D 渲染与 AIGC 运用。作为视觉中国签约插画师，将插画与 3D 输出沉淀为可复用的材质库与 IP 资产，落地到运营项目（渠道订货、在线对账、政策可视），并运用 AIGC 制作比赛宣传、年末贺岁、数字人采访等视频，为各业务线设计落地 IP。",
        "short": "横向优势：插画 / 3D 渲染 / AIGC 运用的能力拓展与运营落地。",
        "link": "https://www.zcool.com.cn/u/ZNTIyMjA1MTY=#tab_anchor",
        "tags": [("hx-tag-illu", "Illustration", None),
                 ("hx-tag-3d", "3D / AIGC", None),
                 ("hx-tag-year", "2026", None)],
        "meta": _meta("hengxiang-advantage", "raw/project_images/hengxiang-advantage.json"),
    },
    {
        "slug": "illustration",
        "title": "插画",
        "pid": "illustration-2026",
        "dir": "illustration",
        "desc": "插画：以视觉表现力为核心的横向创作能力。作为视觉中国签约插画师，将商业插画、IP 形象与运营视觉沉淀为可复用的素材与材质资产，覆盖花卉、节庆、人物与数字艺术等主题；并以动态影像与 3D 动效把静态插画延展为可播放的作品集，落地到比赛宣传、年末贺岁与业务线 IP 设计。",
        "short": "插画：视觉中国签约插画师作品集，商业插画 / IP 视觉 / 动态影像。",
        # Video-led project: meta[0] carries a `video` entry, so the stock
        # WebGL video-texture path paints the cover as a looping clip.
        "tags": [("illu-tag-illu", "Illustration", None),
                 ("illu-tag-motion", "Motion / 3D", None),
                 ("illu-tag-year", "2026", None)],
        "meta": _meta("illustration", "raw/project_images/illustration.json"),
    },
    {
        "slug": "ai-video",
        "title": "AI短视频",
        "pid": "ai-short-video-2026",
        "dir": "ai-video",
        "desc": "AI 创新实验·儿童故事短视频：以 AIGC 生成工作流打造累计播放破百万的儿童故事系列。担任项目主理人，从设计背景、技术应用与内容运营三类挑战出发，建立数据驱动的选题、封面与剧情迭代策略，并用 LoRA 角色一致性训练、AI 视频模型与自动化工作流把单集制作从 5 天压缩到 0.5 天，形成内容运营与技术应用互相成就的规模化生产链路。",
        "short": "AI 创新实验·儿童故事短视频，AIGC 工作流与 LoRA 角色一致性驱动的百万播放系列。",
        # The home cover is the requested "01" title page (1.jpg). No
        # home_cover override here: this project's card is a still, so
        # cover() falls through to meta[0] both for the card and for the
        # first slide of the detail sheet.
        "tags": [("aiv-tag-aigc", "AIGC", None),
                 ("aiv-tag-video", "AI / Video", None),
                 ("aiv-tag-year", "2026", None)],
        "meta": _meta("ai-video", "raw/project_images/ai-video.json"),
    },
]

# Relative order of the locally added case studies. DIFFERENT from the home
# strip: this drives data.projects, the /full index, sitemap and markdown.
DISPLAY_ORDER = ["oppo-service", "naivideo", "oppo-self-service",
                 "erp", "csa-service", "hengxiang-advantage",
                 "illustration", "ai-video"]
assert set(DISPLAY_ORDER) == {p["slug"] for p in PROJECTS}
PROJECTS.sort(key=lambda p: DISPLAY_ORDER.index(p["slug"]))

# the eight case studies shipped with the original site, in the recorded
# order of its own home.featured
ORIGINAL_FEATURED = [
    ("nathan-riley", "Nathan Riley"),
    ("casa-di-solare", "Casa Di Solare"),
    ("the-lookback", "The Lookback"),
    ("book-of-happiness", "Book Of Happiness"),
    ("dogelon-mars", "Dogelon Mars"),
    ("gil-huybrecht", "Gil Huybrecht"),
    ("discoveryland", "Discoveryland"),
    ("griflan", "Griflan"),
]

# ---------------------------------------------------------------------------
# HOME_ORDER is THE single source of truth for the home card strip.
# A complete 16-item permutation (1-based positions):
#    1 oppo-service      2 naivideo            3 oppo-self-service
#    4 erp               5 csa-service         6 hengxiang-advantage
#    7 ai-video
#    8..15  the eight original case studies, in their own recorded order
#   16 illustration
# The client's `useAsyncData("featured")` reads home.featured and computes
# BOTH the home strip and each detail page's prev/next ring from that one
# array. So home.featured in every Nuxt payload + the GraphQL replay, the SSR
# <article> strip, the sr-only SEO list and all related href/labels must be
# derived from this list, otherwise Vue reports hydration mismatches.
# ---------------------------------------------------------------------------
LOCAL_HEAD = ["oppo-service", "naivideo", "oppo-self-service",
              "erp", "csa-service", "hengxiang-advantage", "ai-video"]
LOCAL_TAIL = ["illustration"]
ORIGINAL_ORDER = [s for s, _ in ORIGINAL_FEATURED]
HOME_ORDER = LOCAL_HEAD + ORIGINAL_ORDER + LOCAL_TAIL
assert len(HOME_ORDER) == 16 and len(set(HOME_ORDER)) == 16
assert set(HOME_ORDER) == set(ORIGINAL_ORDER) | {p["slug"] for p in PROJECTS}

_TITLES = dict(ORIGINAL_FEATURED)
_TITLES.update({p["slug"]: p["title"] for p in PROJECTS})
FEATURED = [(s, _TITLES[s]) for s in HOME_ORDER]


def cover(p):
    """Home-card cover (src/thumb/card, og:image), normally the first slide.

    A project whose detail sheet opens with an extra title slide can pin the
    cover to another entry with `cover_index`; the detail `images[]` array
    still follows the full `meta` order.
    """
    return p["meta"][p.get("cover_index", 0)]


def slide_urls(p):
    m = cover(p)
    return ("/" + p["dir"] + "/" + m["main"]["file"],
            "/" + p["dir"] + "/" + m["_small"]["file"],
            "/" + p["dir"] + "/" + m["_card"]["file"])


def video_url(p, m):
    """Relative URL of a slide's looping WebGL video texture, or None."""
    v = m.get("video")
    return "/" + p["dir"] + "/" + v["file"] if v else None
