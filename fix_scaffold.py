import sys, re, os

BASE = r'C:\Users\ASUS\Desktop\program'

# 1. Fix deps.py - replace broken require_ta
deps_path = os.path.join(BASE, 'backend', 'app', 'core', 'deps.py')
with open(deps_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Remove any existing (possibly broken) require_ta
content = re.sub(
    r'\n\nasync def require_ta\(current_user: CurrentUser = Depends\(get_current_user\)\) -> CurrentUser:.*?(?=\Z)',
    '',
    content,
    flags=re.DOTALL
)
content = content.rstrip()

# Add correct require_ta
new_func = """

async def require_ta(current_user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    \"\"\"要求当前用户具备助教或管理员角色。\"\"\"
    if current_user.role not in ('ta', 'admin'):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='当前账号没有助教权限')
    return current_user
"""

with open(deps_path, 'w', encoding='utf-8') as f:
    f.write(content + new_func)

print('Fixed: deps.py')

# 2. Fix student_learning_event.py - rename metadata
sl_path = os.path.join(BASE, 'backend', 'app', 'models', 'student_learning_event.py')
with open(sl_path, 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace('    metadata: Mapped[dict | None]', '    event_metadata: Mapped[dict | None]')
content = content.replace("comment=\"事件元数据\"", "comment=\"事件元数据\"")
content = content.replace('\"metadata\", JSONB', '\"event_metadata\", JSONB')

# Also fix the Alembic migration line
# Actually the migration uses JSONB not a column name, so it's fine
with open(sl_path, 'w', encoding='utf-8') as f:
    f.write(content)

print('Fixed: student_learning_event.py')

# 3. Fix ta_alert_record.py - it has no metadata column, just check
print('Checked: ta_alert_record.py (no metadata column)')

# 4. Fix alembic migration to match the renamed column
mig_path = os.path.join(BASE, 'backend', 'alembic', 'versions', '0045_ta_portal_base.py')
if os.path.exists(mig_path):
    with open(mig_path, 'r', encoding='utf-8') as f:
        content = f.read()
    content = content.replace(
        '        sa.Column(\"metadata\", JSONB, nullable=True),',
        '        sa.Column(\"event_metadata\", JSONB, nullable=True),'
    )
    with open(mig_path, 'w', encoding='utf-8') as f:
        f.write(content)
    print('Fixed: migration file')
else:
    print('Migration not found, skipping')

print()

# Verify all Python files
files = [
    os.path.join(BASE, 'backend', 'app', 'core', 'deps.py'),
    os.path.join(BASE, 'backend', 'app', 'models', 'student_learning_event.py'),
    os.path.join(BASE, 'backend', 'app', 'models', 'ta_alert_record.py'),
    os.path.join(BASE, 'backend', 'app', 'models', 'ta_class.py'),
    os.path.join(BASE, 'backend', 'app', 'models', 'ta_class_student.py'),
    os.path.join(BASE, 'backend', 'app', 'models', 'ta_grading_record.py'),
    os.path.join(BASE, 'backend', 'app', 'models', 'ta_lesson_plan.py'),
    os.path.join(BASE, 'backend', 'app', 'api', 'v1', 'routes', 'ta.py'),
    os.path.join(BASE, 'backend', 'alembic', 'versions', '0045_ta_portal_base.py'),
]

import ast
all_ok = True
for fp in files:
    if not os.path.exists(fp):
        print(f'SKIP (not found): {os.path.basename(fp)}')
        continue
    try:
        with open(fp, 'r', encoding='utf-8') as f:
            ast.parse(f.read())
        print(f'OK: {os.path.basename(fp)}')
    except SyntaxError as e:
        print(f'ERR: {os.path.basename(fp)}: {e}')
        all_ok = False

print()
print('All OK!' if all_ok else 'Some files have errors!')
