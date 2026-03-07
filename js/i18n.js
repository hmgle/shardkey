// i18n.js — lightweight in-browser i18n (no dependencies)
(function () {
    'use strict';

    var STORAGE_KEY = 'shardkey.lang';
    var SUPPORTED = ['en', 'ja', 'zh-CN', 'zh-TW'];

    var translations = {
        'zh-CN': {
            'app.title': 'ShardKey - 答题解锁秘密',
            'app.tagline': '通过回答问题离线解锁秘密的工具',
            'ui.language': '语言',
            'tabs.create': '创建挑战',
            'tabs.solve': '求解挑战',

            'create.secret.title': '设置秘密',
            'create.secret.label': '要分享的秘密',
            'create.secret.placeholder': '输入你的秘密，例如手机号、密码、一段话...',
            'create.secret.hint': '支持中文、英文、数字和符号。秘密将被加密，只有正确回答足够多的问题才能恢复。',
            'create.title.label': '挑战标题（可选）',
            'create.title.placeholder': '例如：获取我的手机号',
            'create.desc.label': '挑战描述（可选）',
            'create.desc.placeholder': '例如：回答问题获取秘密',

            'create.questions.title': '设置问题',
            'create.questions.add': '+ 添加问题',
            'create.threshold.title': '门限设置',
            'create.threshold.label': '门限值',
            'create.threshold.hint': '至少需要答对多少题。值越大，需要知道的答案越多，也更不容易被随手猜中。',
            'create.question_count.label': '问题总数',
            'create.generate': '生成挑战',

            'create.question.number': '问题 {n}',
            'create.question.delete': '删除',
            'create.answer.delete': '删除',
            'create.question.text.label': '问题内容',
            'create.question.text.placeholder': '例如：我的猫叫什么名字？',
            'create.answers.label': '正确答案',
            'create.answers.add_alt': '+ 添加备选答案',
            'create.hint.label': '提示（可选）',
            'create.hint.placeholder': '给求解者的提示',
            'create.answer.placeholder_single': '答案（大小写不敏感）',
            'create.answer.placeholder_indexed': '答案 {n}（大小写不敏感）',

            'solve.load.title': '加载挑战',
            'solve.load.desc': '通过地址栏链接自动加载，或手动导入挑战文件/链接。',
            'solve.load.from_file': '从文件导入',
            'solve.load.paste_link': '粘贴链接',
            'solve.load.link_placeholder': '粘贴包含挑战数据的链接...',
            'solve.load.load': '加载',
            'solve.load.note': '本工具完全离线运行；弱答案仍可能被离线猜解。',
            'solve.change': '更换挑战',
            'solve.questions.title': '回答问题',
            'solve.unlock': '解锁秘密',
            'solve.solving': '正在求解...',
            'solve.unlocked.title': '秘密已解锁！',
            'solve.failed.title': '求解失败',
            'solve.meta.unknown_date': '未知日期',
            'solve.meta.format': '门限：{threshold}/{total} · 创建于 {date}',
            'solve.question.prefix': '问题 {n}：',
            'solve.hint.prefix': '提示：',
            'solve.answer.placeholder': '输入你的答案（不知道可以留空）',
            'solve.unlocked.detail': '已填写 {answered} 个答案，使用其中 {used} 个恢复秘密。',

            'footer.text': 'ShardKey · 离线问答解锁器',

            'ui.error.title': '错误',
            'ui.load_failed.title': '加载失败',

            'runtime.not_supported.title': '运行环境不支持',
            'runtime.not_supported.missing': '当前浏览器缺少必要能力：{missing}。',
            'runtime.not_supported.before_example': '建议使用最新版 Chrome / Edge / Firefox，并尽量通过本地静态服务打开（例如 ',
            'runtime.not_supported.after_example': '）。',

            'defaults.challenge_title': '秘密挑战',
            'defaults.challenge_desc': '在这个离线问答解锁器中回答问题来获取秘密！',

            'progress.encrypting_shares': '正在加密问题分片...',
            'progress.splitting_secret': '正在拆分秘密分片...',

            'generate.success.title': '挑战创建成功！',
            'generate.share_intro.link': '分享以下链接给你的朋友。他们可以在离线问答解锁器中打开它，并至少答对 {threshold} 个问题来获取秘密。',
            'generate.share_intro.large': '挑战数据较大，建议通过“下载 JSON 文件”离线分享给朋友。他们至少答对 {threshold} 个问题后才能获取秘密。',
            'generate.copy_link': '复制链接',
            'generate.copied': '已复制！',
            'generate.copy_failed': '复制失败',
            'generate.download_json': '下载 JSON 文件',
            'generate.hint.hash_too_long': '提示：挑战数据过大（hash 长度 {hashLen}），出于安全限制无法通过链接导入，请使用“下载 JSON 文件”分享。',
            'generate.hint.url_too_long': '提示：链接长度为 {urlLen}，部分平台可能截断或打不开，建议使用“下载 JSON 文件”分享。',

            'validation.secret.required': '请输入要分享的秘密。',
            'validation.secret.too_long': '秘密过长（最多 {max} 字节）。',
            'validation.secret.encode_failed': '秘密编码失败，请检查输入内容。',
            'validation.questions.min2': '请至少设置 2 个包含问题和答案的问题。',
            'validation.questions.too_many': '问题数量过多（最多 {max} 个）。',
            'validation.title.too_long': '挑战标题过长（最多 {max} 字符）。',
            'validation.desc.too_long': '挑战描述过长（最多 {max} 字符）。',
            'validation.question.text_too_long': '第 {n} 个问题内容过长（最多 {max} 字符）。',
            'validation.question.hint_too_long': '第 {n} 个问题提示过长（最多 {max} 字符）。',
            'validation.threshold.min2': '门限值至少为 2。',
            'validation.threshold.too_large': '门限值过大（最大 {max}）。',
            'validation.threshold.gt_questions': '门限值 ({threshold}) 不能超过有效问题数 ({count})。',

            'errors.random.invalid_range': '随机范围无效',
            'errors.base64url.invalid_field': 'Base64Url 字段无效',
            'errors.secret.too_long_bytes': '秘密过长（最多 {max} 字节）',
            'errors.secret.payload.invalid_format': '秘密载荷格式无效',
            'errors.secret.payload.length_invalid': '秘密载荷长度无效',
            'errors.secret.payload.marker_invalid': '秘密载荷标记无效',
            'errors.secret.payload.length_mismatch': '秘密载荷长度不匹配',
            'errors.secret.payload.checksum_failed': '秘密载荷校验失败',
            'errors.link.invalid_data': '链接挑战数据无效',
            'errors.link.too_long_use_json': '链接挑战数据过长，请改用 JSON 文件分享/导入',
            'errors.link.parse_failed': '链接解析失败',
            'errors.file.invalid': '无效的挑战文件',
            'errors.file.too_large': '挑战文件过大（{size} 字节），请减少题目数量/秘密长度后重试',
            'errors.file.invalid_format': '无效的挑战文件格式',
            'errors.file.read_failed': '读取文件失败',
            'errors.secret.too_large_for_threshold': '秘密过大，无法编码到当前门限区间。',
            'errors.secret.cannot_construct_interval': '无法为当前秘密构造安全门限区间。请提高门限值或减少问题数量。',
            'errors.secret.empty': '秘密不能为空',
            'errors.questions.less_than_threshold': '问题数量 ({count}) 不能少于门限值 ({threshold})',
            'errors.threshold.min2': '门限值至少为 2',
            'errors.challenge.generate_failed': '生成挑战失败，请重试。',
            'errors.question.missing_answer': '第 {n} 个问题缺少答案',
            'errors.question.too_many_answers': '第 {n} 个问题答案过多（最多 {max} 个）',
            'errors.solver.need_at_least': '需要至少回答 {threshold} 个问题，当前只回答了 {answered} 个。',
            'errors.solver.failed_prefix': '求解失败：{msg}',
            'errors.solver.timeout_suffix': '（求解超时，可尝试减少填写的答案数量后重试）',
            'errors.solver.limit_suffix': '（已达到求解上限，可尝试减少填写的答案数量后重试）',
            'errors.solver.verify_failed': '验证失败——部分答案可能不正确。请检查答案后重试。{suffix}',
            'errors.challenge.invalid_format': '无效的挑战数据格式',
            'errors.challenge.unsupported_secret_encoding': '不支持的秘密编码格式',
            'errors.challenge.threshold_invalid_format': '门限值格式无效',
            'errors.challenge.secret_length_field_invalid': '秘密长度字段无效',
            'errors.challenge.kdf_invalid': 'KDF 参数无效',
            'errors.challenge.kdf_iterations_invalid': 'KDF 迭代次数无效',
            'errors.challenge.kdf_dklen_invalid': 'KDF 输出长度无效',
            'errors.challenge.kdf_saltlen_invalid': 'KDF salt 长度无效',
            'errors.challenge.questions_list_invalid': '题目列表格式无效',
            'errors.challenge.question_count_below_threshold': '题目数量少于门限值',
            'errors.challenge.question_field_invalid': '题目字段格式无效',
            'errors.challenge.question_id_invalid': '题目 ID 无效',
            'errors.challenge.question_id_duplicate': '题目 ID 重复',
            'errors.challenge.question_text_too_long': '题目内容过长',
            'errors.challenge.question_hint_too_long': '题目提示过长',
            'errors.challenge.question_params_invalid_format': '题目参数格式无效',
            'errors.challenge.question_params_invalid_value': '题目参数取值无效',
            'errors.challenge.question_salt_invalid': '题目 salt 无效',
            'errors.challenge.question_tag_invalid': '题目校验标签无效',
            'errors.challenge.too_many_variants': '单题答案变体过多（最多 {max} 个）',
            'errors.challenge.answer_variants_count_invalid': '题目答案变体数量无效',
            'errors.challenge.title_too_long': '挑战标题过长',
            'errors.challenge.desc_too_long': '挑战描述过长',

            'errors.solve.load_failed': '加载挑战失败',
            'errors.solve.file_read_failed': '文件读取失败：{msg}',
            'errors.solve.unknown_error': '未知错误',
            'errors.solve.link_no_data': '链接中没有挑战数据',
            'errors.solve.link_expected_challenge': '这里需要的是普通挑战链接，不是分片链接',

            'mode.title': '选择模式',
            'mode.classic.name': '经典问答',
            'mode.classic.desc': '设置问题，答对足够多即可解锁秘密。',
            'mode.shard.name': '多人合力恢复',
            'mode.shard.desc': '把秘密拆成多个分片，集齐足够分片后恢复。',

            'create.shard.secret_title': '拆分秘密',
            'create.shard.secret_label': '要拆分的秘密',
            'create.shard.secret_placeholder': '输入想让大家一起恢复的秘密...',
            'create.shard.secret_hint': '系统会把秘密拆成多个独立分片，集齐足够多分片才能恢复。',
            'create.shard.total_label': '总分片数 N',
            'create.shard.total_hint': '准备分给多少个人或多少个保存位置。',
            'create.shard.threshold_label': '恢复门限 K',
            'create.shard.threshold_hint': '至少需要多少个分片同时到场才能恢复秘密。',
            'create.shard.generate': '生成分片',
            'create.shard.result.title': '分片生成完成！',
            'create.shard.result.summary': '已生成 {total} 个分片，至少需要 {threshold} 个分片合力才能恢复秘密。',
            'create.shard.result.download': '下载全部分片 JSON',
            'create.shard.result.copy': '复制',
            'create.shard.result.copied': '已复制',
            'create.shard.result.item_label': '分片 {n}',

            'solve.shard.load.title': '加载分片',
            'solve.shard.load.desc': '导入任意一个分片链接/JSON，或导入包含整组分片的 JSON 文件。',
            'solve.shard.load.note': '集齐足够分片后，就能像集齐龙珠一样把秘密恢复出来。',
            'solve.shard.load.from_file': '从分片文件导入',
            'solve.shard.load.paste': '粘贴分片链接或 JSON',
            'solve.shard.load.placeholder': '粘贴单个分片链接、单个分片 JSON，或分片数组 JSON...',
            'solve.shard.load.submit': '加载分片',
            'solve.shard.merge.title': '合力恢复秘密',
            'solve.shard.change': '更换分片',
            'solve.shard.merge.hint': '把你收集到的分片分别粘贴进下方输入框。',
            'solve.shard.merge.add_input': '+ 添加分片输入框',
            'solve.shard.merge.submit': '恢复秘密',
            'solve.shard.merge.loading': '正在恢复...',
            'solve.shard.merge.meta': '门限：{threshold}/{total} · 挑战 ID：{id}',
            'solve.shard.merge.input_label': '分片 {n}',
            'solve.shard.merge.input_locked': '已自动填入',
            'solve.shard.merge.input_placeholder': '粘贴分片链接或单个分片 JSON...',
            'solve.shard.merge.success_title': '秘密已恢复！',
            'solve.shard.merge.success_detail': '本次使用了 {used} 个分片，门限要求为 {threshold} 个。',
            'solve.shard.merge.failed_title': '恢复失败',

            'errors.shard.link.invalid_data': '分片链接数据无效',
            'errors.shard.link.too_long': '分片链接过长，请改用 JSON 文件导入',
            'errors.shard.invalid_format': '无效的分片数据格式',
            'errors.shard.type_invalid': '分片类型无效',
            'errors.shard.challenge_id_invalid': '分片挑战 ID 无效',
            'errors.shard.total_invalid': '总分片数无效（需在 2 到 {max} 之间）',
            'errors.shard.threshold_invalid': '分片门限值无效',
            'errors.shard.index_invalid': '分片序号无效',
            'errors.shard.secret_length_invalid': '分片中的秘密长度字段无效',
            'errors.shard.collection_empty': '分片集合不能为空',
            'errors.shard.mixed_collection': '这些分片不属于同一个秘密',
            'errors.shard.secret_empty': '请输入要拆分的秘密。',
            'errors.shard.threshold_gt_total': '恢复门限不能超过总分片数。',
            'errors.shard.generate_failed': '生成分片失败，请重试。',
            'errors.shard.need_more': '至少需要 {threshold} 个分片，当前只有 {count} 个。',
            'errors.shard.duplicate_index': '检测到重复分片（分片 {index}）。',
            'errors.shard.load_failed': '加载分片失败',
            'errors.shard.input.empty': '请先输入至少一个分片。',
            'errors.shard.input.too_large': '分片输入内容过大，请改用文件导入。',
            'errors.shard.input.single_only': '这里一次只能粘贴单个分片；若要批量导入，请使用“加载分片”入口。',
            'errors.shard.input.expect_single': '这里需要单个分片链接或单个分片 JSON。',
            'errors.challenge.only_v4': '仅支持 v4 挑战格式',
            'errors.challenge.threshold_invalid': '挑战门限值无效',
            'errors.challenge.secret_box_invalid': '挑战密文数据无效',
            'errors.challenge.answer_box_invalid': '题目答案密文无效',
            'errors.challenge.question_share_index_invalid': '题目分片索引无效',
            'errors.challenge.question_share_index_duplicate': '题目分片索引重复',
            'errors.shard.only_v4': '仅支持 v4 分片格式',
            'errors.shard.share_index_invalid': '分片 share 索引无效',
            'errors.shard.share_invalid': '分片 share 数据无效',
            'errors.shard.recovery_failed': '恢复失败，部分分片可能不正确或已损坏。',
            'errors.shamir.invalid_secret': '待拆分的秘密无效',
            'errors.shamir.invalid_total': 'Shamir 总分片数无效',
            'errors.shamir.invalid_threshold': 'Shamir 门限值无效',
            'errors.shamir.need_more_shares': '可用 share 数量不足，无法恢复秘密',
            'errors.shamir.invalid_share': '检测到无效的 share 数据',
            'errors.shamir.duplicate_share': '检测到重复的 share 数据',
        },
        en: {
            'app.title': 'ShardKey - Unlock Secrets by Q&A',
            'app.tagline': 'An offline question-and-answer unlocker for shared secrets',
            'ui.language': 'Language',
            'tabs.create': 'Create',
            'tabs.solve': 'Solve',

            'create.secret.title': 'Secret',
            'create.secret.label': 'Secret to share',
            'create.secret.placeholder': 'Enter your secret (e.g. a phone number, password, a note...)',
            'create.secret.hint': 'Supports any characters. The secret is encrypted and can only be recovered after enough correct answers.',
            'create.title.label': 'Challenge title (optional)',
            'create.title.placeholder': 'e.g. Get my phone number',
            'create.desc.label': 'Challenge description (optional)',
            'create.desc.placeholder': 'e.g. Answer to unlock the secret',

            'create.questions.title': 'Questions',
            'create.questions.add': '+ Add question',
            'create.threshold.title': 'Threshold',
            'create.threshold.label': 'Threshold',
            'create.threshold.hint': 'How many correct answers are required. Higher values require more known answers and make casual guessing harder.',
            'create.question_count.label': 'Total questions',
            'create.generate': 'Generate challenge',

            'create.question.number': 'Question {n}',
            'create.question.delete': 'Delete',
            'create.answer.delete': 'Delete',
            'create.question.text.label': 'Question',
            'create.question.text.placeholder': "e.g. What's my cat's name?",
            'create.answers.label': 'Correct answers',
            'create.answers.add_alt': '+ Add alternative answer',
            'create.hint.label': 'Hint (optional)',
            'create.hint.placeholder': 'Hint for the solver',
            'create.answer.placeholder_single': 'Answer (case-insensitive)',
            'create.answer.placeholder_indexed': 'Answer {n} (case-insensitive)',

            'solve.load.title': 'Load challenge',
            'solve.load.desc': 'Auto-load from the URL hash, or import a challenge file/link.',
            'solve.load.from_file': 'Import JSON',
            'solve.load.paste_link': 'Paste link',
            'solve.load.link_placeholder': 'Paste a link that contains challenge data...',
            'solve.load.load': 'Load',
            'solve.load.note': 'Everything runs locally in your browser. Weak answers may still be guessed offline.',
            'solve.change': 'Load another challenge',
            'solve.questions.title': 'Answer questions',
            'solve.unlock': 'Unlock secret',
            'solve.solving': 'Solving...',
            'solve.unlocked.title': 'Secret unlocked!',
            'solve.failed.title': 'Solve failed',
            'solve.meta.unknown_date': 'Unknown date',
            'solve.meta.format': 'Threshold: {threshold}/{total} · Created {date}',
            'solve.question.prefix': 'Question {n}: ',
            'solve.hint.prefix': 'Hint: ',
            'solve.answer.placeholder': "Your answer (leave empty if you don't know)",
            'solve.unlocked.detail': 'You filled {answered} answers; used {used} of them to recover the secret.',

            'footer.text': 'ShardKey · offline Q&A unlocker',

            'ui.error.title': 'Error',
            'ui.load_failed.title': 'Load failed',

            'runtime.not_supported.title': 'Unsupported environment',
            'runtime.not_supported.missing': 'Missing required features: {missing}.',
            'runtime.not_supported.before_example': 'Use the latest Chrome / Edge / Firefox and open via a local static server (e.g. ',
            'runtime.not_supported.after_example': ').',

            'defaults.challenge_title': 'Secret Challenge',
            'defaults.challenge_desc': 'Answer questions in this offline unlocker to recover the secret!',

            'progress.encrypting_shares': 'Encrypting question shares...',
            'progress.splitting_secret': 'Splitting secret shares...',

            'generate.success.title': 'Challenge created!',
            'generate.share_intro.link': 'Share this link. The recipient can open it in the offline unlocker and must answer at least {threshold} questions correctly to recover the secret.',
            'generate.share_intro.large': 'This challenge is large. Share it offline via “Download JSON”. The recipient must answer at least {threshold} questions correctly to recover the secret.',
            'generate.copy_link': 'Copy link',
            'generate.copied': 'Copied!',
            'generate.copy_failed': 'Copy failed',
            'generate.download_json': 'Download JSON',
            'generate.hint.hash_too_long': 'Tip: challenge data is too large (hash length {hashLen}). For safety, link import is disabled—use “Download JSON”.',
            'generate.hint.url_too_long': 'Tip: link length is {urlLen}. Some platforms may truncate it—use “Download JSON”.',

            'validation.secret.required': 'Enter a secret to share.',
            'validation.secret.too_long': 'Secret is too long (max {max} bytes).',
            'validation.secret.encode_failed': 'Failed to encode the secret. Please check your input.',
            'validation.questions.min2': 'Add at least 2 questions with answers.',
            'validation.questions.too_many': 'Too many questions (max {max}).',
            'validation.title.too_long': 'Title is too long (max {max} characters).',
            'validation.desc.too_long': 'Description is too long (max {max} characters).',
            'validation.question.text_too_long': 'Question #{n} is too long (max {max} characters).',
            'validation.question.hint_too_long': 'Hint for question #{n} is too long (max {max} characters).',
            'validation.threshold.min2': 'Threshold must be at least 2.',
            'validation.threshold.too_large': 'Threshold is too large (max {max}).',
            'validation.threshold.gt_questions': 'Threshold ({threshold}) cannot exceed the number of valid questions ({count}).',

            'errors.random.invalid_range': 'Invalid random range',
            'errors.base64url.invalid_field': 'Invalid Base64Url field',
            'errors.secret.too_long_bytes': 'Secret is too long (max {max} bytes)',
            'errors.secret.payload.invalid_format': 'Invalid secret payload format',
            'errors.secret.payload.length_invalid': 'Invalid secret payload length',
            'errors.secret.payload.marker_invalid': 'Invalid secret payload marker',
            'errors.secret.payload.length_mismatch': 'Secret payload length mismatch',
            'errors.secret.payload.checksum_failed': 'Secret payload checksum failed',
            'errors.link.invalid_data': 'Invalid challenge data in link',
            'errors.link.too_long_use_json': 'Challenge data is too long for a link. Use a JSON file instead.',
            'errors.link.parse_failed': 'Failed to parse link',
            'errors.file.invalid': 'Invalid challenge file',
            'errors.file.too_large': 'Challenge file is too large ({size} bytes). Reduce secret/questions and try again.',
            'errors.file.invalid_format': 'Invalid challenge file format',
            'errors.file.read_failed': 'Failed to read file',
            'errors.secret.too_large_for_threshold': 'Secret is too large for the current threshold interval.',
            'errors.secret.cannot_construct_interval': 'Cannot construct a safe threshold interval. Increase the threshold or reduce the number of questions.',
            'errors.secret.empty': 'Secret cannot be empty',
            'errors.questions.less_than_threshold': 'Number of questions ({count}) cannot be less than threshold ({threshold})',
            'errors.threshold.min2': 'Threshold must be at least 2',
            'errors.challenge.generate_failed': 'Failed to generate challenge. Please try again.',
            'errors.question.missing_answer': 'Question #{n} is missing an answer',
            'errors.question.too_many_answers': 'Question #{n} has too many answers (max {max})',
            'errors.solver.need_at_least': 'Answer at least {threshold} questions. You only answered {answered}.',
            'errors.solver.failed_prefix': 'Solve failed: {msg}',
            'errors.solver.timeout_suffix': '(Solve timed out. Try filling fewer answers and retry.)',
            'errors.solver.limit_suffix': '(Reached solve limit. Try filling fewer answers and retry.)',
            'errors.solver.verify_failed': 'Verification failed—some answers may be incorrect. Check and retry. {suffix}',
            'errors.challenge.invalid_format': 'Invalid challenge data format',
            'errors.challenge.unsupported_secret_encoding': 'Unsupported secret encoding',
            'errors.challenge.threshold_invalid_format': 'Invalid threshold format',
            'errors.challenge.secret_length_field_invalid': 'Invalid secret length field',
            'errors.challenge.kdf_invalid': 'Invalid KDF parameters',
            'errors.challenge.kdf_iterations_invalid': 'Invalid KDF iteration count',
            'errors.challenge.kdf_dklen_invalid': 'Invalid KDF output length',
            'errors.challenge.kdf_saltlen_invalid': 'Invalid KDF salt length',
            'errors.challenge.questions_list_invalid': 'Invalid questions list format',
            'errors.challenge.question_count_below_threshold': 'Not enough questions for the threshold',
            'errors.challenge.question_field_invalid': 'Invalid question field format',
            'errors.challenge.question_id_invalid': 'Invalid question ID',
            'errors.challenge.question_id_duplicate': 'Duplicate question ID',
            'errors.challenge.question_text_too_long': 'Question text is too long',
            'errors.challenge.question_hint_too_long': 'Hint is too long',
            'errors.challenge.question_params_invalid_format': 'Invalid question parameters format',
            'errors.challenge.question_params_invalid_value': 'Invalid question parameter value',
            'errors.challenge.question_salt_invalid': 'Invalid question salt',
            'errors.challenge.question_tag_invalid': 'Invalid question verification tag',
            'errors.challenge.too_many_variants': 'Too many answer variants for one question (max {max})',
            'errors.challenge.answer_variants_count_invalid': 'Invalid number of answer variants',
            'errors.challenge.title_too_long': 'Title is too long',
            'errors.challenge.desc_too_long': 'Description is too long',

            'errors.solve.load_failed': 'Failed to load challenge',
            'errors.solve.file_read_failed': 'Failed to read file: {msg}',
            'errors.solve.unknown_error': 'Unknown error',
            'errors.solve.link_no_data': 'No challenge data found in the link',
            'errors.solve.link_expected_challenge': 'This field expects a regular challenge link, not a shard link',

            'mode.title': 'Choose Mode',
            'mode.classic.name': 'Classic Q&A',
            'mode.classic.desc': 'Set questions and unlock the secret with enough correct answers.',
            'mode.shard.name': 'Group Recovery',
            'mode.shard.desc': 'Split the secret into shards and recover it after gathering enough pieces.',

            'create.shard.secret_title': 'Split Secret',
            'create.shard.secret_label': 'Secret to split',
            'create.shard.secret_placeholder': 'Enter the secret everyone will recover together...',
            'create.shard.secret_hint': 'The app splits the secret into independent shards. Only enough shards together can restore it.',
            'create.shard.total_label': 'Total shards N',
            'create.shard.total_hint': 'How many people or storage locations will receive a shard.',
            'create.shard.threshold_label': 'Recovery threshold K',
            'create.shard.threshold_hint': 'How many shards must be present at the same time to restore the secret.',
            'create.shard.generate': 'Generate shards',
            'create.shard.result.title': 'Shards created!',
            'create.shard.result.summary': '{total} shards created. At least {threshold} shards are required to recover the secret.',
            'create.shard.result.download': 'Download all shards as JSON',
            'create.shard.result.copy': 'Copy',
            'create.shard.result.copied': 'Copied',
            'create.shard.result.item_label': 'Shard {n}',

            'solve.shard.load.title': 'Load Shards',
            'solve.shard.load.desc': 'Import any shard link/JSON, or load a JSON file that contains a whole shard set.',
            'solve.shard.load.note': 'Gather enough shards and restore the secret like collecting dragon balls.',
            'solve.shard.load.from_file': 'Import shard file',
            'solve.shard.load.paste': 'Paste shard link or JSON',
            'solve.shard.load.placeholder': 'Paste a shard link, a single shard JSON, or a shard-array JSON...',
            'solve.shard.load.submit': 'Load shards',
            'solve.shard.merge.title': 'Recover Together',
            'solve.shard.change': 'Change shards',
            'solve.shard.merge.hint': 'Paste each shard you collected into a separate input below.',
            'solve.shard.merge.add_input': '+ Add another shard input',
            'solve.shard.merge.submit': 'Recover secret',
            'solve.shard.merge.loading': 'Recovering...',
            'solve.shard.merge.meta': 'Threshold: {threshold}/{total} · Challenge ID: {id}',
            'solve.shard.merge.input_label': 'Shard {n}',
            'solve.shard.merge.input_locked': 'auto-filled',
            'solve.shard.merge.input_placeholder': 'Paste a shard link or a single shard JSON...',
            'solve.shard.merge.success_title': 'Secret recovered!',
            'solve.shard.merge.success_detail': 'Used {used} shards this time. The threshold requirement is {threshold}.',
            'solve.shard.merge.failed_title': 'Recovery failed',

            'errors.shard.link.invalid_data': 'Invalid shard link data',
            'errors.shard.link.too_long': 'Shard link is too long; import it from JSON instead',
            'errors.shard.invalid_format': 'Invalid shard data format',
            'errors.shard.type_invalid': 'Invalid shard type',
            'errors.shard.challenge_id_invalid': 'Invalid shard challenge ID',
            'errors.shard.total_invalid': 'Invalid total shard count (must be between 2 and {max})',
            'errors.shard.threshold_invalid': 'Invalid shard threshold',
            'errors.shard.index_invalid': 'Invalid shard index',
            'errors.shard.secret_length_invalid': 'Invalid secret length field in shard',
            'errors.shard.collection_empty': 'Shard collection cannot be empty',
            'errors.shard.mixed_collection': 'These shards do not belong to the same secret',
            'errors.shard.secret_empty': 'Please enter a secret to split.',
            'errors.shard.threshold_gt_total': 'Recovery threshold cannot exceed total shards.',
            'errors.shard.generate_failed': 'Failed to generate shards. Please try again.',
            'errors.shard.need_more': 'At least {threshold} shards are required; only {count} provided.',
            'errors.shard.duplicate_index': 'Duplicate shard detected (shard {index}).',
            'errors.shard.load_failed': 'Failed to load shards',
            'errors.shard.input.empty': 'Enter at least one shard first.',
            'errors.shard.input.too_large': 'Shard input is too large. Import from a file instead.',
            'errors.shard.input.single_only': 'This field accepts only one shard at a time. Use the load action for batch import.',
            'errors.shard.input.expect_single': 'This field expects a single shard link or a single shard JSON.',
            'errors.challenge.only_v4': 'Only v4 challenge format is supported',
            'errors.challenge.threshold_invalid': 'Invalid challenge threshold',
            'errors.challenge.secret_box_invalid': 'Invalid challenge ciphertext box',
            'errors.challenge.answer_box_invalid': 'Invalid answer ciphertext box',
            'errors.challenge.question_share_index_invalid': 'Invalid question share index',
            'errors.challenge.question_share_index_duplicate': 'Duplicate question share index',
            'errors.shard.only_v4': 'Only v4 shard format is supported',
            'errors.shard.share_index_invalid': 'Invalid shard share index',
            'errors.shard.share_invalid': 'Invalid shard share data',
            'errors.shard.recovery_failed': 'Recovery failed. Some shards may be incorrect or corrupted.',
            'errors.shamir.invalid_secret': 'Invalid secret for Shamir splitting',
            'errors.shamir.invalid_total': 'Invalid Shamir total share count',
            'errors.shamir.invalid_threshold': 'Invalid Shamir threshold',
            'errors.shamir.need_more_shares': 'Not enough shares to recover the secret',
            'errors.shamir.invalid_share': 'Invalid share data detected',
            'errors.shamir.duplicate_share': 'Duplicate share data detected',
        },
        ja: {
            'app.title': 'ShardKey - 質問に答えて秘密を解除',
            'app.tagline': '質問への回答で秘密をローカル解除するツール',
            'ui.language': '言語',
            'tabs.create': '作成',
            'tabs.solve': '解除',

            'create.secret.title': '秘密を設定',
            'create.secret.label': '共有する秘密',
            'create.secret.placeholder': '秘密を入力（例：電話番号、パスワード、メモなど）',
            'create.secret.hint': '任意の文字を使用できます。秘密は暗号化され、十分な正答数がないと復元できません。',
            'create.title.label': 'チャレンジタイトル（任意）',
            'create.title.placeholder': '例：私の電話番号を取得',
            'create.desc.label': '説明（任意）',
            'create.desc.placeholder': '例：答えると秘密を解除',

            'create.questions.title': '質問を設定',
            'create.questions.add': '+ 質問を追加',
            'create.threshold.title': 'しきい値',
            'create.threshold.label': 'しきい値',
            'create.threshold.hint': '最低何問正解すればよいかを示します。値が大きいほど、知っている答えが多く必要になり、気軽な推測にも通りにくくなります。',
            'create.question_count.label': '質問数',
            'create.generate': 'チャレンジを生成',

            'create.question.number': '質問 {n}',
            'create.question.delete': '削除',
            'create.answer.delete': '削除',
            'create.question.text.label': '質問内容',
            'create.question.text.placeholder': '例：私の猫の名前は？',
            'create.answers.label': '正解',
            'create.answers.add_alt': '+ 別の正解を追加',
            'create.hint.label': 'ヒント（任意）',
            'create.hint.placeholder': '解答者向けのヒント',
            'create.answer.placeholder_single': '答え（大文字小文字は区別しません）',
            'create.answer.placeholder_indexed': '答え {n}（大文字小文字は区別しません）',

            'solve.load.title': 'チャレンジを読み込む',
            'solve.load.desc': 'URL ハッシュから自動読み込み、またはチャレンジのファイル/リンクを読み込みます。',
            'solve.load.from_file': 'JSON をインポート',
            'solve.load.paste_link': 'リンクを貼り付け',
            'solve.load.link_placeholder': 'チャレンジデータを含むリンクを貼り付け...',
            'solve.load.load': '読み込む',
            'solve.load.note': 'すべての処理はブラウザ内で完結します。弱い答えはオフラインで推測される可能性があります。',
            'solve.change': '別のチャレンジを読み込む',
            'solve.questions.title': '質問に答える',
            'solve.unlock': '秘密を解除',
            'solve.solving': '解除中...',
            'solve.unlocked.title': '秘密を解除しました！',
            'solve.failed.title': '解除に失敗',
            'solve.meta.unknown_date': '不明',
            'solve.meta.format': 'しきい値：{threshold}/{total} · 作成日 {date}',
            'solve.question.prefix': '質問 {n}：',
            'solve.hint.prefix': 'ヒント：',
            'solve.answer.placeholder': '答えを入力（わからない場合は空欄）',
            'solve.unlocked.detail': '入力した答えは {answered} 件、そのうち {used} 件で秘密を復元しました。',

            'footer.text': 'ShardKey · オフライン Q&A アンロッカー',

            'ui.error.title': 'エラー',
            'ui.load_failed.title': '読み込み失敗',

            'runtime.not_supported.title': '実行環境が未対応',
            'runtime.not_supported.missing': '必要な機能が不足しています：{missing}。',
            'runtime.not_supported.before_example': '最新版の Chrome / Edge / Firefox の使用を推奨します。可能であればローカル静的サーバー経由で開いてください（例：',
            'runtime.not_supported.after_example': '）。',

            'defaults.challenge_title': '秘密チャレンジ',
            'defaults.challenge_desc': 'このオフライン Q&A アンロッカーで質問に答えて秘密を解除！',

            'progress.encrypting_shares': '質問ごとの share を暗号化中...',
            'progress.splitting_secret': '秘密の share を分割中...',

            'generate.success.title': 'チャレンジを作成しました！',
            'generate.share_intro.link': 'このリンクを共有してください。相手はオフライン Q&A アンロッカーで開き、秘密を復元するには少なくとも {threshold} 問の正解が必要です。',
            'generate.share_intro.large': 'チャレンジが大きいため、“JSON をダウンロード”でオフライン共有してください。秘密を復元するには、少なくとも {threshold} 問の正解が必要です。',
            'generate.copy_link': 'リンクをコピー',
            'generate.copied': 'コピーしました！',
            'generate.copy_failed': 'コピー失敗',
            'generate.download_json': 'JSON をダウンロード',
            'generate.hint.hash_too_long': 'ヒント：データが大きすぎます（hash 長 {hashLen}）。安全のためリンク読み込みを無効化しています。“JSON をダウンロード”を使用してください。',
            'generate.hint.url_too_long': 'ヒント：リンク長は {urlLen} です。一部の環境で切り詰められる可能性があります。“JSON をダウンロード”を推奨します。',

            'validation.secret.required': '共有する秘密を入力してください。',
            'validation.secret.too_long': '秘密が長すぎます（最大 {max} バイト）。',
            'validation.secret.encode_failed': '秘密のエンコードに失敗しました。入力を確認してください。',
            'validation.questions.min2': '答え付きの質問を少なくとも 2 つ設定してください。',
            'validation.questions.too_many': '質問が多すぎます（最大 {max}）。',
            'validation.title.too_long': 'タイトルが長すぎます（最大 {max} 文字）。',
            'validation.desc.too_long': '説明が長すぎます（最大 {max} 文字）。',
            'validation.question.text_too_long': '{n} 番目の質問内容が長すぎます（最大 {max} 文字）。',
            'validation.question.hint_too_long': '{n} 番目のヒントが長すぎます（最大 {max} 文字）。',
            'validation.threshold.min2': 'しきい値は 2 以上にしてください。',
            'validation.threshold.too_large': 'しきい値が大きすぎます（最大 {max}）。',
            'validation.threshold.gt_questions': 'しきい値（{threshold}）は有効な質問数（{count}）を超えられません。',

            'errors.random.invalid_range': '乱数範囲が無効です',
            'errors.base64url.invalid_field': 'Base64Url フィールドが無効です',
            'errors.secret.too_long_bytes': '秘密が長すぎます（最大 {max} バイト）',
            'errors.secret.payload.invalid_format': '秘密ペイロード形式が無効です',
            'errors.secret.payload.length_invalid': '秘密ペイロード長が無効です',
            'errors.secret.payload.marker_invalid': '秘密ペイロードのマーカーが無効です',
            'errors.secret.payload.length_mismatch': '秘密ペイロード長が一致しません',
            'errors.secret.payload.checksum_failed': '秘密ペイロードの検証に失敗しました',
            'errors.link.invalid_data': 'リンクのチャレンジデータが無効です',
            'errors.link.too_long_use_json': 'リンクのデータが長すぎます。代わりに JSON ファイルを使用してください。',
            'errors.link.parse_failed': 'リンク解析に失敗しました',
            'errors.file.invalid': 'チャレンジファイルが無効です',
            'errors.file.too_large': 'チャレンジファイルが大きすぎます（{size} バイト）。質問数/秘密を減らして再試行してください。',
            'errors.file.invalid_format': 'チャレンジファイル形式が無効です',
            'errors.file.read_failed': 'ファイルの読み取りに失敗しました',
            'errors.secret.too_large_for_threshold': '現在のしきい値区間では秘密が大きすぎます。',
            'errors.secret.cannot_construct_interval': '安全なしきい値区間を構成できません。しきい値を上げるか質問数を減らしてください。',
            'errors.secret.empty': '秘密は空にできません',
            'errors.questions.less_than_threshold': '質問数（{count}）はしきい値（{threshold}）未満にできません',
            'errors.threshold.min2': 'しきい値は 2 以上です',
            'errors.challenge.generate_failed': 'チャレンジの生成に失敗しました。再試行してください。',
            'errors.question.missing_answer': '{n} 番目の質問に答えがありません',
            'errors.question.too_many_answers': '{n} 番目の質問の答えが多すぎます（最大 {max}）',
            'errors.solver.need_at_least': '少なくとも {threshold} 問に答えてください。現在 {answered} 問です。',
            'errors.solver.failed_prefix': '解除に失敗：{msg}',
            'errors.solver.timeout_suffix': '（処理がタイムアウトしました。入力する答えを減らして再試行してください）',
            'errors.solver.limit_suffix': '（試行上限に達しました。入力する答えを減らして再試行してください）',
            'errors.solver.verify_failed': '検証に失敗しました。答えが一部間違っている可能性があります。確認して再試行してください。{suffix}',
            'errors.challenge.invalid_format': 'チャレンジデータ形式が無効です',
            'errors.challenge.unsupported_secret_encoding': '秘密エンコーディングが未対応です',
            'errors.challenge.threshold_invalid_format': 'しきい値形式が無効です',
            'errors.challenge.secret_length_field_invalid': '秘密長フィールドが無効です',
            'errors.challenge.kdf_invalid': 'KDF パラメータが無効です',
            'errors.challenge.kdf_iterations_invalid': 'KDF 反復回数が無効です',
            'errors.challenge.kdf_dklen_invalid': 'KDF 出力長が無効です',
            'errors.challenge.kdf_saltlen_invalid': 'KDF salt 長が無効です',
            'errors.challenge.questions_list_invalid': '質問リスト形式が無効です',
            'errors.challenge.question_count_below_threshold': 'しきい値に対して質問数が不足しています',
            'errors.challenge.question_field_invalid': '質問フィールド形式が無効です',
            'errors.challenge.question_id_invalid': '質問 ID が無効です',
            'errors.challenge.question_id_duplicate': '質問 ID が重複しています',
            'errors.challenge.question_text_too_long': '質問内容が長すぎます',
            'errors.challenge.question_hint_too_long': 'ヒントが長すぎます',
            'errors.challenge.question_params_invalid_format': '質問パラメータ形式が無効です',
            'errors.challenge.question_params_invalid_value': '質問パラメータ値が無効です',
            'errors.challenge.question_salt_invalid': '質問 salt が無効です',
            'errors.challenge.question_tag_invalid': '質問の検証タグが無効です',
            'errors.challenge.too_many_variants': '1 問あたりの答えバリアントが多すぎます（最大 {max}）',
            'errors.challenge.answer_variants_count_invalid': '答えバリアント数が無効です',
            'errors.challenge.title_too_long': 'タイトルが長すぎます',
            'errors.challenge.desc_too_long': '説明が長すぎます',

            'errors.solve.load_failed': 'チャレンジの読み込みに失敗しました',
            'errors.solve.file_read_failed': 'ファイル読み込み失敗：{msg}',
            'errors.solve.unknown_error': '不明なエラー',
            'errors.solve.link_no_data': 'リンクにチャレンジデータがありません',
            'errors.solve.link_expected_challenge': 'ここでは分片リンクではなく通常のチャレンジリンクが必要です',

            'mode.title': 'モードを選択',
            'mode.classic.name': '定番 Q&A',
            'mode.classic.desc': '問題を設定し、十分な正解数で秘密を解除します。',
            'mode.shard.name': 'みんなで復元',
            'mode.shard.desc': '秘密を複数の分片に分け、十分な数を集めて復元します。',

            'create.shard.secret_title': '秘密を分割',
            'create.shard.secret_label': '分割する秘密',
            'create.shard.secret_placeholder': 'みんなで復元したい秘密を入力してください...',
            'create.shard.secret_hint': '秘密は独立した複数の分片に分割され、十分な数がそろったときだけ復元できます。',
            'create.shard.total_label': '分片の総数 N',
            'create.shard.total_hint': '何人または何か所に分けて渡すかを指定します。',
            'create.shard.threshold_label': '復元しきい値 K',
            'create.shard.threshold_hint': '秘密の復元に同時に必要な分片数です。',
            'create.shard.generate': '分片を生成',
            'create.shard.result.title': '分片を生成しました！',
            'create.shard.result.summary': '{total} 個の分片を生成しました。秘密の復元には最低 {threshold} 個必要です。',
            'create.shard.result.download': '全分片を JSON でダウンロード',
            'create.shard.result.copy': 'コピー',
            'create.shard.result.copied': 'コピー済み',
            'create.shard.result.item_label': '分片 {n}',

            'solve.shard.load.title': '分片を読み込む',
            'solve.shard.load.desc': '任意の分片リンク/JSON を読み込むか、分片一式を含む JSON ファイルをインポートします。',
            'solve.shard.load.note': '十分な分片を集めれば、ドラゴンボールのように秘密を呼び戻せます。',
            'solve.shard.load.from_file': '分片ファイルをインポート',
            'solve.shard.load.paste': '分片リンクまたは JSON を貼り付け',
            'solve.shard.load.placeholder': '分片リンク、単一の分片 JSON、または分片配列 JSON を貼り付けてください...',
            'solve.shard.load.submit': '分片を読み込む',
            'solve.shard.merge.title': '力を合わせて復元',
            'solve.shard.change': '分片を変更',
            'solve.shard.merge.hint': '集めた分片をそれぞれ下の入力欄に貼り付けてください。',
            'solve.shard.merge.add_input': '+ 分片入力欄を追加',
            'solve.shard.merge.submit': '秘密を復元',
            'solve.shard.merge.loading': '復元中...',
            'solve.shard.merge.meta': 'しきい値: {threshold}/{total} · チャレンジ ID: {id}',
            'solve.shard.merge.input_label': '分片 {n}',
            'solve.shard.merge.input_locked': '自動入力済み',
            'solve.shard.merge.input_placeholder': '分片リンクまたは単一の分片 JSON を貼り付けてください...',
            'solve.shard.merge.success_title': '秘密を復元しました！',
            'solve.shard.merge.success_detail': '今回は {used} 個の分片を使用しました。必要しきい値は {threshold} 個です。',
            'solve.shard.merge.failed_title': '復元に失敗しました',

            'errors.shard.link.invalid_data': '分片リンクのデータが無効です',
            'errors.shard.link.too_long': '分片リンクが長すぎます。代わりに JSON をインポートしてください',
            'errors.shard.invalid_format': '分片データ形式が無効です',
            'errors.shard.type_invalid': '分片タイプが無効です',
            'errors.shard.challenge_id_invalid': '分片のチャレンジ ID が無効です',
            'errors.shard.total_invalid': '分片総数が無効です（2 〜 {max}）',
            'errors.shard.threshold_invalid': '分片のしきい値が無効です',
            'errors.shard.index_invalid': '分片番号が無効です',
            'errors.shard.secret_length_invalid': '分片内の秘密長フィールドが無効です',
            'errors.shard.collection_empty': '分片集合を空にはできません',
            'errors.shard.mixed_collection': 'これらの分片は同じ秘密に属していません',
            'errors.shard.secret_empty': '分割する秘密を入力してください。',
            'errors.shard.threshold_gt_total': '復元しきい値は分片総数を超えられません。',
            'errors.shard.generate_failed': '分片の生成に失敗しました。もう一度お試しください。',
            'errors.shard.need_more': '少なくとも {threshold} 個の分片が必要ですが、現在は {count} 個です。',
            'errors.shard.duplicate_index': '重複した分片が見つかりました（分片 {index}）。',
            'errors.shard.load_failed': '分片の読み込みに失敗しました',
            'errors.shard.input.empty': 'まず少なくとも 1 つの分片を入力してください。',
            'errors.shard.input.too_large': '分片入力が大きすぎます。代わりにファイルをインポートしてください。',
            'errors.shard.input.single_only': 'この欄には一度に 1 つの分片しか貼り付けられません。複数読み込みは読み込み操作を使ってください。',
            'errors.shard.input.expect_single': 'ここでは単一の分片リンクまたは単一の分片 JSON が必要です。',
            'errors.challenge.only_v4': 'v4 形式のチャレンジのみ対応しています',
            'errors.challenge.threshold_invalid': 'チャレンジのしきい値が無効です',
            'errors.challenge.secret_box_invalid': 'チャレンジの暗号ボックスが無効です',
            'errors.challenge.answer_box_invalid': '回答用の暗号ボックスが無効です',
            'errors.challenge.question_share_index_invalid': '質問の share インデックスが無効です',
            'errors.challenge.question_share_index_duplicate': '質問の share インデックスが重複しています',
            'errors.shard.only_v4': 'v4 分片形式のみ対応しています',
            'errors.shard.share_index_invalid': '分片 share インデックスが無効です',
            'errors.shard.share_invalid': '分片 share データが無効です',
            'errors.shard.recovery_failed': '復元に失敗しました。分片が壊れているか、誤っている可能性があります。',
            'errors.shamir.invalid_secret': 'Shamir 分割する秘密が無効です',
            'errors.shamir.invalid_total': 'Shamir の総分片数が無効です',
            'errors.shamir.invalid_threshold': 'Shamir のしきい値が無効です',
            'errors.shamir.need_more_shares': '秘密を復元するための share が不足しています',
            'errors.shamir.invalid_share': '無効な share データが検出されました',
            'errors.shamir.duplicate_share': '重複した share データが検出されました',
        },
        'zh-TW': {
            'app.title': 'ShardKey - 答題解鎖秘密',
            'app.tagline': '透過回答問題離線解鎖秘密的工具',
            'ui.language': '語言',
            'tabs.create': '建立挑戰',
            'tabs.solve': '求解挑戰',

            'create.secret.title': '設定秘密',
            'create.secret.label': '要分享的秘密',
            'create.secret.placeholder': '輸入你的秘密，例如手機號、密碼、一段話...',
            'create.secret.hint': '支援中文、英文、數字與符號。秘密將被加密，只有正確回答足夠多的問題才能恢復。',
            'create.title.label': '挑戰標題（可選）',
            'create.title.placeholder': '例如：取得我的手機號',
            'create.desc.label': '挑戰描述（可選）',
            'create.desc.placeholder': '例如：回答問題取得秘密',

            'create.questions.title': '設定問題',
            'create.questions.add': '+ 新增問題',
            'create.threshold.title': '門檻設定',
            'create.threshold.label': '門檻值',
            'create.threshold.hint': '至少需要答對多少題。值越大，需要知道的答案越多，也更不容易被隨手猜中。',
            'create.question_count.label': '問題總數',
            'create.generate': '生成挑戰',

            'create.question.number': '問題 {n}',
            'create.question.delete': '刪除',
            'create.answer.delete': '刪除',
            'create.question.text.label': '問題內容',
            'create.question.text.placeholder': '例如：我的貓叫什麼名字？',
            'create.answers.label': '正確答案',
            'create.answers.add_alt': '+ 新增備選答案',
            'create.hint.label': '提示（可選）',
            'create.hint.placeholder': '給求解者的提示',
            'create.answer.placeholder_single': '答案（不區分大小寫）',
            'create.answer.placeholder_indexed': '答案 {n}（不區分大小寫）',

            'solve.load.title': '載入挑戰',
            'solve.load.desc': '可透過網址雜湊自動載入，或手動匯入挑戰檔案/連結。',
            'solve.load.from_file': '從檔案匯入',
            'solve.load.paste_link': '貼上連結',
            'solve.load.link_placeholder': '貼上包含挑戰資料的連結...',
            'solve.load.load': '載入',
            'solve.load.note': '所有處理都在瀏覽器本機完成；弱答案仍可能被離線猜解。',
            'solve.change': '更換挑戰',
            'solve.questions.title': '回答問題',
            'solve.unlock': '解鎖秘密',
            'solve.solving': '求解中...',
            'solve.unlocked.title': '秘密已解鎖！',
            'solve.failed.title': '求解失敗',
            'solve.meta.unknown_date': '未知日期',
            'solve.meta.format': '門檻：{threshold}/{total} · 建立於 {date}',
            'solve.question.prefix': '問題 {n}：',
            'solve.hint.prefix': '提示：',
            'solve.answer.placeholder': '輸入你的答案（不知道可以留空）',
            'solve.unlocked.detail': '已填寫 {answered} 個答案，使用其中 {used} 個恢復秘密。',

            'footer.text': 'ShardKey · 離線問答解鎖器',

            'ui.error.title': '錯誤',
            'ui.load_failed.title': '載入失敗',

            'runtime.not_supported.title': '執行環境不支援',
            'runtime.not_supported.missing': '目前瀏覽器缺少必要能力：{missing}。',
            'runtime.not_supported.before_example': '建議使用最新版 Chrome / Edge / Firefox，並盡量透過本機靜態服務開啟（例如 ',
            'runtime.not_supported.after_example': '）。',

            'defaults.challenge_title': '秘密挑戰',
            'defaults.challenge_desc': '在這個離線問答解鎖器中回答問題來取得秘密！',

            'progress.encrypting_shares': '正在加密題目分片...',
            'progress.splitting_secret': '正在拆分秘密分片...',

            'generate.success.title': '挑戰建立成功！',
            'generate.share_intro.link': '分享以下連結給你的朋友。他們可以在離線問答解鎖器中開啟它，並至少答對 {threshold} 個問題來取得秘密。',
            'generate.share_intro.large': '挑戰資料較大，建議透過「下載 JSON 檔」離線分享給朋友。他們至少答對 {threshold} 個問題後才能取得秘密。',
            'generate.copy_link': '複製連結',
            'generate.copied': '已複製！',
            'generate.copy_failed': '複製失敗',
            'generate.download_json': '下載 JSON 檔',
            'generate.hint.hash_too_long': '提示：挑戰資料過大（hash 長度 {hashLen}），出於安全限制無法透過連結匯入，請使用「下載 JSON 檔」分享。',
            'generate.hint.url_too_long': '提示：連結長度為 {urlLen}，部分平台可能截斷或打不開，建議使用「下載 JSON 檔」分享。',

            'validation.secret.required': '請輸入要分享的秘密。',
            'validation.secret.too_long': '秘密過長（最多 {max} 位元組）。',
            'validation.secret.encode_failed': '秘密編碼失敗，請檢查輸入內容。',
            'validation.questions.min2': '請至少設定 2 個包含問題與答案的問題。',
            'validation.questions.too_many': '問題數量過多（最多 {max} 個）。',
            'validation.title.too_long': '挑戰標題過長（最多 {max} 字元）。',
            'validation.desc.too_long': '挑戰描述過長（最多 {max} 字元）。',
            'validation.question.text_too_long': '第 {n} 個問題內容過長（最多 {max} 字元）。',
            'validation.question.hint_too_long': '第 {n} 個問題提示過長（最多 {max} 字元）。',
            'validation.threshold.min2': '門檻值至少為 2。',
            'validation.threshold.too_large': '門檻值過大（最大 {max}）。',
            'validation.threshold.gt_questions': '門檻值（{threshold}）不能超過有效問題數（{count}）。',

            'errors.random.invalid_range': '隨機範圍無效',
            'errors.base64url.invalid_field': 'Base64Url 欄位無效',
            'errors.secret.too_long_bytes': '秘密過長（最多 {max} 位元組）',
            'errors.secret.payload.invalid_format': '秘密載荷格式無效',
            'errors.secret.payload.length_invalid': '秘密載荷長度無效',
            'errors.secret.payload.marker_invalid': '秘密載荷標記無效',
            'errors.secret.payload.length_mismatch': '秘密載荷長度不匹配',
            'errors.secret.payload.checksum_failed': '秘密載荷校驗失敗',
            'errors.link.invalid_data': '連結挑戰資料無效',
            'errors.link.too_long_use_json': '連結挑戰資料過長，請改用 JSON 檔分享/匯入',
            'errors.link.parse_failed': '連結解析失敗',
            'errors.file.invalid': '無效的挑戰檔案',
            'errors.file.too_large': '挑戰檔案過大（{size} 位元組），請減少題目數/秘密長度後重試',
            'errors.file.invalid_format': '無效的挑戰檔案格式',
            'errors.file.read_failed': '讀取檔案失敗',
            'errors.secret.too_large_for_threshold': '秘密過大，無法編碼到目前門檻區間。',
            'errors.secret.cannot_construct_interval': '無法為目前秘密構造安全門檻區間。請提高門檻值或減少問題數量。',
            'errors.secret.empty': '秘密不能為空',
            'errors.questions.less_than_threshold': '問題數量（{count}）不能少於門檻值（{threshold}）',
            'errors.threshold.min2': '門檻值至少為 2',
            'errors.challenge.generate_failed': '生成挑戰失敗，請重試。',
            'errors.question.missing_answer': '第 {n} 個問題缺少答案',
            'errors.question.too_many_answers': '第 {n} 個問題答案過多（最多 {max} 個）',
            'errors.solver.need_at_least': '需要至少回答 {threshold} 個問題，目前只回答了 {answered} 個。',
            'errors.solver.failed_prefix': '求解失敗：{msg}',
            'errors.solver.timeout_suffix': '（求解逾時，可嘗試減少填寫的答案數量後重試）',
            'errors.solver.limit_suffix': '（已達求解上限，可嘗試減少填寫的答案數量後重試）',
            'errors.solver.verify_failed': '驗證失敗——部分答案可能不正確。請檢查答案後重試。{suffix}',
            'errors.challenge.invalid_format': '無效的挑戰資料格式',
            'errors.challenge.unsupported_secret_encoding': '不支援的秘密編碼格式',
            'errors.challenge.threshold_invalid_format': '門檻值格式無效',
            'errors.challenge.secret_length_field_invalid': '秘密長度欄位無效',
            'errors.challenge.kdf_invalid': 'KDF 參數無效',
            'errors.challenge.kdf_iterations_invalid': 'KDF 迭代次數無效',
            'errors.challenge.kdf_dklen_invalid': 'KDF 輸出長度無效',
            'errors.challenge.kdf_saltlen_invalid': 'KDF salt 長度無效',
            'errors.challenge.questions_list_invalid': '題目列表格式無效',
            'errors.challenge.question_count_below_threshold': '題目數量少於門檻值',
            'errors.challenge.question_field_invalid': '題目欄位格式無效',
            'errors.challenge.question_id_invalid': '題目 ID 無效',
            'errors.challenge.question_id_duplicate': '題目 ID 重複',
            'errors.challenge.question_text_too_long': '題目內容過長',
            'errors.challenge.question_hint_too_long': '題目提示過長',
            'errors.challenge.question_params_invalid_format': '題目參數格式無效',
            'errors.challenge.question_params_invalid_value': '題目參數取值無效',
            'errors.challenge.question_salt_invalid': '題目 salt 無效',
            'errors.challenge.question_tag_invalid': '題目校驗標籤無效',
            'errors.challenge.too_many_variants': '單題答案變體過多（最多 {max} 個）',
            'errors.challenge.answer_variants_count_invalid': '題目答案變體數量無效',
            'errors.challenge.title_too_long': '挑戰標題過長',
            'errors.challenge.desc_too_long': '挑戰描述過長',

            'errors.solve.load_failed': '載入挑戰失敗',
            'errors.solve.file_read_failed': '檔案讀取失敗：{msg}',
            'errors.solve.unknown_error': '未知錯誤',
            'errors.solve.link_no_data': '連結中沒有挑戰資料',
            'errors.solve.link_expected_challenge': '這裡需要的是一般挑戰連結，不是分片連結',

            'mode.title': '選擇模式',
            'mode.classic.name': '經典問答',
            'mode.classic.desc': '設定問題並答對足夠多題後解鎖秘密。',
            'mode.shard.name': '多人合力恢復',
            'mode.shard.desc': '把秘密拆成多個分片，集齊足夠分片後恢復。',

            'create.shard.secret_title': '拆分秘密',
            'create.shard.secret_label': '要拆分的秘密',
            'create.shard.secret_placeholder': '輸入想讓大家一起恢復的秘密...',
            'create.shard.secret_hint': '系統會把秘密拆成多個獨立分片，集齊足夠分片才能恢復。',
            'create.shard.total_label': '總分片數 N',
            'create.shard.total_hint': '準備分給多少人或多少個保存位置。',
            'create.shard.threshold_label': '恢復門檻 K',
            'create.shard.threshold_hint': '至少需要多少個分片同時到場才能恢復秘密。',
            'create.shard.generate': '生成分片',
            'create.shard.result.title': '分片生成完成！',
            'create.shard.result.summary': '已生成 {total} 個分片，至少需要 {threshold} 個分片合力才能恢復秘密。',
            'create.shard.result.download': '下載全部分片 JSON',
            'create.shard.result.copy': '複製',
            'create.shard.result.copied': '已複製',
            'create.shard.result.item_label': '分片 {n}',

            'solve.shard.load.title': '載入分片',
            'solve.shard.load.desc': '匯入任意一個分片連結/JSON，或匯入包含整組分片的 JSON 檔案。',
            'solve.shard.load.note': '集齊足夠分片後，就能像集齊龍珠一樣把秘密恢復出來。',
            'solve.shard.load.from_file': '從分片檔案匯入',
            'solve.shard.load.paste': '貼上分片連結或 JSON',
            'solve.shard.load.placeholder': '貼上單個分片連結、單個分片 JSON，或分片陣列 JSON...',
            'solve.shard.load.submit': '載入分片',
            'solve.shard.merge.title': '合力恢復秘密',
            'solve.shard.change': '更換分片',
            'solve.shard.merge.hint': '把你收集到的分片分別貼進下方輸入框。',
            'solve.shard.merge.add_input': '+ 添加分片輸入框',
            'solve.shard.merge.submit': '恢復秘密',
            'solve.shard.merge.loading': '正在恢復...',
            'solve.shard.merge.meta': '門檻：{threshold}/{total} · 挑戰 ID：{id}',
            'solve.shard.merge.input_label': '分片 {n}',
            'solve.shard.merge.input_locked': '已自動填入',
            'solve.shard.merge.input_placeholder': '貼上分片連結或單個分片 JSON...',
            'solve.shard.merge.success_title': '秘密已恢復！',
            'solve.shard.merge.success_detail': '本次使用了 {used} 個分片，門檻要求為 {threshold} 個。',
            'solve.shard.merge.failed_title': '恢復失敗',

            'errors.shard.link.invalid_data': '分片連結資料無效',
            'errors.shard.link.too_long': '分片連結過長，請改用 JSON 檔匯入',
            'errors.shard.invalid_format': '無效的分片資料格式',
            'errors.shard.type_invalid': '分片類型無效',
            'errors.shard.challenge_id_invalid': '分片挑戰 ID 無效',
            'errors.shard.total_invalid': '總分片數無效（需在 2 到 {max} 之間）',
            'errors.shard.threshold_invalid': '分片門檻值無效',
            'errors.shard.index_invalid': '分片序號無效',
            'errors.shard.secret_length_invalid': '分片中的秘密長度欄位無效',
            'errors.shard.collection_empty': '分片集合不能為空',
            'errors.shard.mixed_collection': '這些分片不屬於同一個秘密',
            'errors.shard.secret_empty': '請輸入要拆分的秘密。',
            'errors.shard.threshold_gt_total': '恢復門檻不能超過總分片數。',
            'errors.shard.generate_failed': '生成分片失敗，請重試。',
            'errors.shard.need_more': '至少需要 {threshold} 個分片，當前只有 {count} 個。',
            'errors.shard.duplicate_index': '檢測到重複分片（分片 {index}）。',
            'errors.shard.load_failed': '載入分片失敗',
            'errors.shard.input.empty': '請先輸入至少一個分片。',
            'errors.shard.input.too_large': '分片輸入內容過大，請改用檔案匯入。',
            'errors.shard.input.single_only': '這裡一次只能貼上單個分片；若要批次匯入，請使用「載入分片」入口。',
            'errors.shard.input.expect_single': '這裡需要單個分片連結或單個分片 JSON。',
            'errors.challenge.only_v4': '僅支援 v4 挑戰格式',
            'errors.challenge.threshold_invalid': '挑戰門檻值無效',
            'errors.challenge.secret_box_invalid': '挑戰密文資料無效',
            'errors.challenge.answer_box_invalid': '題目答案密文無效',
            'errors.challenge.question_share_index_invalid': '題目分片索引無效',
            'errors.challenge.question_share_index_duplicate': '題目分片索引重複',
            'errors.shard.only_v4': '僅支援 v4 分片格式',
            'errors.shard.share_index_invalid': '分片 share 索引無效',
            'errors.shard.share_invalid': '分片 share 資料無效',
            'errors.shard.recovery_failed': '恢復失敗，部分分片可能不正確或已損壞。',
            'errors.shamir.invalid_secret': '待拆分的秘密無效',
            'errors.shamir.invalid_total': 'Shamir 總分片數無效',
            'errors.shamir.invalid_threshold': 'Shamir 門檻值無效',
            'errors.shamir.need_more_shares': '可用 share 數量不足，無法恢復秘密',
            'errors.shamir.invalid_share': '偵測到無效的 share 資料',
            'errors.shamir.duplicate_share': '偵測到重複的 share 資料',
        },
    };

    function safeGet(obj, key) {
        if (!obj) return undefined;
        return Object.prototype.hasOwnProperty.call(obj, key) ? obj[key] : undefined;
    }

    function normalizeLang(code) {
        if (!code) return null;
        code = String(code).trim();
        if (!code) return null;
        code = code.replace('_', '-');
        var lower = code.toLowerCase();

        if (lower === 'en' || lower.indexOf('en-') === 0) return 'en';
        if (lower === 'ja' || lower.indexOf('ja-') === 0) return 'ja';

        if (lower === 'zh' || lower === 'zh-cn' || lower.indexOf('zh-hans') === 0 || lower.indexOf('zh-sg') === 0) {
            return 'zh-CN';
        }
        if (lower === 'zh-tw' || lower.indexOf('zh-hant') === 0 || lower.indexOf('zh-hk') === 0 || lower.indexOf('zh-mo') === 0) {
            return 'zh-TW';
        }

        // common aliases
        if (lower === 'zh-hans-cn') return 'zh-CN';
        if (lower === 'zh-hant-tw') return 'zh-TW';

        // exact match for supported
        if (SUPPORTED.indexOf(code) >= 0) return code;

        return null;
    }

    function isSupported(lang) {
        return SUPPORTED.indexOf(lang) >= 0;
    }

    function getLangFromQuery() {
        try {
            var params = new URLSearchParams(window.location.search || '');
            var raw = params.get('lang');
            var norm = normalizeLang(raw);
            return norm && isSupported(norm) ? norm : null;
        } catch (e) {
            return null;
        }
    }

    function getLangFromStorage() {
        try {
            var raw = window.localStorage.getItem(STORAGE_KEY);
            var norm = normalizeLang(raw);
            return norm && isSupported(norm) ? norm : null;
        } catch (e) {
            return null;
        }
    }

    function getLangFromNavigator() {
        try {
            var list = [];
            if (Array.isArray(navigator.languages)) list = list.concat(navigator.languages);
            if (navigator.language) list.push(navigator.language);
            for (var i = 0; i < list.length; i++) {
                var norm = normalizeLang(list[i]);
                if (norm && isSupported(norm)) return norm;
            }
        } catch (e) {
            // ignore
        }
        return null;
    }

    function getInitialLang() {
        return getLangFromQuery() || getLangFromStorage() || getLangFromNavigator() || 'zh-CN';
    }

    var listeners = [];
    var messageCache = Object.create(null);
    var initialFromQuery = getLangFromQuery();
    var currentLang = getInitialLang();
    if (initialFromQuery && initialFromQuery === currentLang) {
        try {
            window.localStorage.setItem(STORAGE_KEY, currentLang);
        } catch (e) {
            // ignore
        }
    }

    function getLang() {
        return currentLang;
    }

    function getLocaleForIntl() {
        if (currentLang === 'en') return 'en-US';
        if (currentLang === 'ja') return 'ja-JP';
        if (currentLang === 'zh-TW') return 'zh-TW';
        return 'zh-CN';
    }

    function getMessages(lang) {
        var norm = normalizeLang(lang || currentLang);
        if (messageCache[norm]) {
            return messageCache[norm];
        }
        var fallback = translations['zh-CN'] || {};
        var dict = translations[norm] || fallback;
        var merged = {};
        Object.keys(fallback).forEach(function (key) {
            merged[key] = fallback[key];
        });
        Object.keys(dict).forEach(function (key) {
            merged[key] = dict[key];
        });
        messageCache[norm] = merged;
        return merged;
    }

    function t(key, params) {
        var dict = getMessages(currentLang);
        var template = safeGet(dict, key);
        if (template === undefined) template = key;

        var out = String(template);
        if (params && typeof params === 'object') {
            Object.keys(params).forEach(function (k) {
                var val = params[k];
                out = out.replace(new RegExp('\{' + k + '\}', 'g'), String(val));
            });
        }
        return out;
    }

    function setLang(lang) {
        var norm = normalizeLang(lang);
        if (!norm || !isSupported(norm)) norm = 'zh-CN';
        if (norm === currentLang) return;
        currentLang = norm;
        try {
            window.localStorage.setItem(STORAGE_KEY, norm);
        } catch (e) {
            // ignore
        }
        try {
            document.documentElement.lang = norm;
        } catch (e) {
            // ignore
        }
        listeners.forEach(function (fn) {
            try { fn(norm); } catch (e) { /* ignore */ }
        });
    }

    function onChange(fn) {
        if (typeof fn !== 'function') return function () {};
        listeners.push(fn);
        return function () {
            var idx = listeners.indexOf(fn);
            if (idx >= 0) listeners.splice(idx, 1);
        };
    }

    // set initial lang attribute early
    try {
        document.documentElement.lang = currentLang;
    } catch (e) {
        // ignore
    }

    window.ShardKeyI18n = {
        supported: SUPPORTED.slice(),
        normalizeLang: normalizeLang,
        getInitialLang: getInitialLang,
        getLang: getLang,
        setLang: setLang,
        onChange: onChange,
        t: t,
        getMessages: getMessages,
        getLocaleForIntl: getLocaleForIntl,
    };
})();
