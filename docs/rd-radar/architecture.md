# R&D Radar architecture

Owner: AI Platform · Last verified: 2026-09-02

R&D is an explicit Admin/PM operation: resolve repository/provider/model, pin commit, collect bounded safe chunks, construct the canonical structured-output request, parse JSON, validate canonical schema, validate citations, then persist safe run/evidence/candidate metadata. It never writes the analyzed repository.

Accepted Production evidence: one terminal `REVIEW_REQUIRED` run, schema PASS, citations PASS, five Evidence records, candidate present, repository writes NO. This evidence is historical; documentation work does not repeat the call.
