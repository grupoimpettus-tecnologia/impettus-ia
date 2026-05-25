from typing import List, Dict
from app.core.config import settings


def build_context(sources: List[Dict]) -> str:
    parts = []
    for idx, src in enumerate(sources, start=1):
        name = src.get("document_name", "Documento")
        text = src.get("text", "")
        parts.append(f"[Fonte {idx}: {name}]\n{text}")
    return "\n\n".join(parts)


def fallback_answer(question: str, sources: List[Dict]) -> str:
    if not sources:
        return (
            "Não encontrei informação suficiente na base de conhecimento para responder com segurança. "
            "Envie documentos oficiais sobre esse tema ou reformule a pergunta com mais detalhes."
        )
    context = build_context(sources)
    return (
        "Encontrei informações relacionadas na base interna, mas a chave OpenAI não está configurada.\n\n"
        "Resumo baseado nos trechos localizados:\n\n"
        f"{context[:3500]}\n\n"
        "Recomendação: configure OPENAI_API_KEY para gerar uma resposta executiva e resumida automaticamente."
    )


def answer_question(question: str, sources: List[Dict]) -> str:
    if not sources:
        return fallback_answer(question, sources)
    if not settings.OPENAI_API_KEY:
        return fallback_answer(question, sources)

    try:
        from openai import OpenAI
        client = OpenAI(api_key=settings.OPENAI_API_KEY)
        context = build_context(sources)
        system = (
            "Você é o Impettus IA, assistente corporativo do Grupo Impettus. "
            "Responda apenas com base no CONTEXTO fornecido. "
            "Se a resposta não estiver no contexto, diga claramente que não encontrou a informação. "
            "Use português do Brasil, tom profissional, direto e útil. "
            "Quando possível, cite o nome do documento usado."
        )
        user = f"CONTEXTO:\n{context}\n\nPERGUNTA:\n{question}"
        resp = client.chat.completions.create(
            model=settings.OPENAI_MODEL,
            messages=[{"role":"system","content":system},{"role":"user","content":user}],
            temperature=0.2,
        )
        return resp.choices[0].message.content or "Não foi possível gerar resposta."
    except Exception as exc:
        return f"Não consegui acionar o modelo de IA. Erro: {exc}\n\n" + fallback_answer(question, sources)
