import os

BOM = b'\xef\xbb\xbf'
base = r'C:\Users\ASUS\Desktop\program'
count = 0

for root, dirs, files in os.walk(base):
    for f in files:
        if not (f.endswith('.py') or f.endswith('.tsx') or f.endswith('.ts') or f.endswith('.md')):
            continue
        fp = os.path.join(root, f)
        try:
            with open(fp, 'rb') as fh:
                data = fh.read()
            if data[:3] == BOM:
                with open(fp, 'wb') as fh:
                    fh.write(data[3:])
                rel = fp[len(base)+1:]
                print(f'Fixed: {rel}')
                count += 1
        except:
            pass

print(f'\nTotal files fixed: {count}')
