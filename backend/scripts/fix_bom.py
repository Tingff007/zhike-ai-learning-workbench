import os

BOM = b'\xef\xbb\xbf'

files_to_check = []

# Backend models
models_dir = r'C:\Users\ASUS\Desktop\program\backend\app\models'
for f in os.listdir(models_dir):
    if f.endswith('.py') and f.startswith('ta_'):
        files_to_check.append(os.path.join(models_dir, f))

# Backend API
files_to_check.append(r'C:\Users\ASUS\Desktop\program\backend\app\api\v1\routes\ta.py')

# Migration
files_to_check.append(r'C:\Users\ASUS\Desktop\program\backend\alembic\versions\0045_ta_portal_base.py')

# Frontend TA files
files_to_check.append(r'C:\Users\ASUS\Desktop\program\frontend\src\app\TAGate.tsx')
files_to_check.append(r'C:\Users\ASUS\Desktop\program\frontend\src\app\TaLayout.tsx')
files_to_check.append(r'C:\Users\ASUS\Desktop\program\frontend\src\app\router.tsx')
files_to_check.append(r'C:\Users\ASUS\Desktop\program\frontend\src\stores\ta.store.ts')

# Frontend TA pages
ta_pages_dir = r'C:\Users\ASUS\Desktop\program\frontend\src\pages\ta'
if os.path.isdir(ta_pages_dir):
    for f in os.listdir(ta_pages_dir):
        if f.endswith('.tsx'):
            files_to_check.append(os.path.join(ta_pages_dir, f))

# Docs
docs_dir = r'C:\Users\ASUS\Desktop\program\docs'
for f in ['12-team-onboarding-guide.md', '13-feature-implementation-checklists.md', '10-competition-implementation-plan.md']:
    fp = os.path.join(docs_dir, f)
    if os.path.isfile(fp):
        files_to_check.append(fp)

fixed = 0
for fp in files_to_check:
    try:
        with open(fp, 'rb') as f:
            data = f.read()
        if data[:3] == BOM:
            with open(fp, 'wb') as f:
                f.write(data[3:])
            print(f'Fixed BOM: {os.path.basename(fp)}')
            fixed += 1
        else:
            print(f'OK (no BOM): {os.path.basename(fp)}')
    except Exception as e:
        print(f'Error {os.path.basename(fp)}: {e}')

print(f'\nFixed {fixed} files with BOM')
