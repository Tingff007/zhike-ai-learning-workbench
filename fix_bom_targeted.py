import os

BOM = b'\xef\xbb\xbf'
base = r'C:\Users\ASUS\Desktop\program'

files = [
    r'backend\app\models\ta_class.py',
    r'backend\app\models\ta_class_student.py',
    r'backend\app\models\ta_lesson_plan.py',
    r'backend\app\models\ta_grading_record.py',
    r'backend\app\models\student_learning_event.py',
    r'backend\app\models\ta_alert_record.py',
    r'backend\app\api\v1\routes\ta.py',
    r'backend\alembic\versions\0045_ta_portal_base.py',
    r'frontend\src\app\TAGate.tsx',
    r'frontend\src\app\TaLayout.tsx',
    r'frontend\src\app\router.tsx',
    r'frontend\src\stores\ta.store.ts',
]

for f in files:
    fp = os.path.join(base, f)
    try:
        with open(fp, 'rb') as fh:
            data = fh.read()
        if data[:3] == BOM:
            with open(fp, 'wb') as fh:
                fh.write(data[3:])
            print(f'Fixed BOM: {f}')
        else:
            print(f'OK (no BOM): {f}')
    except Exception as e:
        print(f'Error: {f}: {e}')
