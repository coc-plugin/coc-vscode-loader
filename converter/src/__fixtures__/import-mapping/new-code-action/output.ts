const action = ((() => { try { return new CodeAction('fix', kind) } catch { return { title: '', kind: '' } as any } })())
return [action]
