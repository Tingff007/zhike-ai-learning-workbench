import urllib.request, json, urllib.parse

headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}

def search_github(query):
    url = f'https://api.github.com/search/repositories?q={urllib.parse.quote(query)}+stars:>500&sort=stars&order=desc&per_page=5'
    try:
        req = urllib.request.Request(url, headers=headers)
        resp = urllib.request.urlopen(req, timeout=15)
        data = json.loads(resp.read())
        results = []
        for item in data.get('items', []):
            results.append({
                'name': item['full_name'],
                'stars': item['stargazers_count'],
                'description': item['description'] or '',
                'url': item['html_url']
            })
        return results
    except Exception as e:
        return [{'error': str(e)}]

queries = [
    'machine learning course curriculum',
    'computer science learning path',
    'deep learning resources',
    'python programming tutorial',
    'data structures algorithms',
    'artificial intelligence course',
]

print('=== GitHub 高质量计算机科学/AI 学习资料 ===')
print()
for q in queries:
    results = search_github(q)
    print(f'查询: {q}')
    for r in results[:5]:
        if 'error' in r:
            print(f'  [ERR] 错误: {r["error"]}')
        else:
            print(f'  ** {r["stars"]} | {r["name"]}')
            desc = r['description'][:120] if r['description'] else 'N/A'
            print(f'     {desc}')
            print(f'     {r["url"]}')
    print()

print('=== 构建计算机科学+AI 知识库推荐资料源 ===')
print()
top_picks = [
    ('CS自学指南', 'https://github.com/PKUFlyingPig/cs-self-learning/', '北大计算机自学路线+资源汇总'),
    ('TeachYourselfCS-CN', 'https://github.com/izackwu/TeachYourselfCS-CN/', '自学计算机科学中文版'),
    ('微软ML课程', 'https://github.com/microsoft/ML-for-Beginners/', '12周机器学习入门课程'),
    ('免费编程书籍', 'https://github.com/EbookFoundation/free-programming-books/', '全球免费编程书籍合集'),
    ('ApacheCN AI学习', 'https://github.com/apachecn/AiLearning/', 'AI/ML/DL学习笔记'),
    ('Papers We Love', 'https://github.com/papers-we-love/papers-we-love/', '经典计算机论文库'),
    ('项目驱动学习', 'https://github.com/practical-tutorials/project-based-learning/', '通过项目学编程'),
    ('深度学习笔记', 'https://github.com/leeyoshinari/DeepLearning-Notes/', '吴恩达深度学习课程笔记'),
    ('Awesome AI', 'https://github.com/owainlewis/awesome-artificial-intelligence/', 'AI资源大全'),
    ('CS50课程', 'https://github.com/cs50/', '哈佛CS50计算机科学导论'),
]
for name, url, desc in top_picks:
    print(f'  >> {name}')
    print(f'     {url}')
    print(f'     {desc}')
    print()
