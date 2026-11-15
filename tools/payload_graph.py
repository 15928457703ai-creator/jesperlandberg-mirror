"""Compact a Nuxt/devalue reference graph, dropping unreachable records."""
def compact(data):
    reachable = set()
    def refs(value):
        if isinstance(value, bool): return
        if isinstance(value, int):
            if 0 <= value < len(data) and value not in reachable:
                reachable.add(value)
                entry = data[value]
                if isinstance(entry, (dict, list)): refs(entry)
        elif isinstance(value, dict):
            for item in value.values(): refs(item)
        elif isinstance(value, list):
            for item in value: refs(item)
    refs(0)
    order = sorted(reachable)
    mapping = {old: new for new, old in enumerate(order)}
    def rewrite(value):
        if isinstance(value, bool): return value
        if isinstance(value, int): return mapping.get(value, value) if value >= 0 else value
        if isinstance(value, list): return [rewrite(item) for item in value]
        if isinstance(value, dict): return {key: rewrite(item) for key,item in value.items()}
        return value
    return [rewrite(data[i]) if isinstance(data[i], (dict,list)) else data[i] for i in order]
