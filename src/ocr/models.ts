/**
 * 내장 텍스트 OCR 모델 (PP-OCRv5 korean) 스펙 + 다운로드/검증.
 *
 * 캐시 위치: `~/.cache/kordoc/models/ppocr/` — 총 ~18MB (det 4.6 + rec 12.8 + dict 0.1)
 * 다운로드 인프라는 수식 OCR 과 공용 (formula/models.ts ensureModelsIn).
 *
 * 모델 출처: PaddlePaddle 공식 HuggingFace org 의 ONNX 변환본 (Apache-2.0).
 * SHA-256 은 실제 다운로드 + HF API lfs.oid 대조로 검증됨 — 변경 금지.
 * 한국어 사전은 rec 리포의 inference.yml `PostProcess.character_dict` 에
 * 내장 (11,945자 — 완성형 한글 11,172 음절 전량 + 자모/라틴/기호).
 */

import { join } from "path"
import {
  type ModelSpec,
  type ModelStatus,
  type ProgressHandler,
  ensureModelsIn,
  getModelStatusIn,
  getModelsDir,
} from "../pdf/formula/models.js"

export const OCR_DET_MODEL: ModelSpec = {
  name: "PP-OCRv5 mobile det",
  filename: "det.onnx",
  url: "https://huggingface.co/PaddlePaddle/PP-OCRv5_mobile_det_onnx/resolve/main/inference.onnx",
  sha256: "a431985659dc921974177a95adcfbb90fd9e51989a5e04d70d0b75f597b6e61d",
  sizeMb: 5,
}

export const OCR_REC_MODEL: ModelSpec = {
  name: "PP-OCRv5 korean rec",
  filename: "rec_korean.onnx",
  url: "https://huggingface.co/PaddlePaddle/korean_PP-OCRv5_mobile_rec_onnx/resolve/main/inference.onnx",
  sha256: "92f0b7785e64fc9090106a241cf4c1eb97472824558272751b88a2a4476d3a08",
  sizeMb: 13,
}

export const OCR_REC_DICT: ModelSpec = {
  name: "PP-OCRv5 korean dict",
  filename: "rec_korean.yml",
  url: "https://huggingface.co/PaddlePaddle/korean_PP-OCRv5_mobile_rec_onnx/resolve/main/inference.yml",
  sha256: "f757fa1c40e99edcf27e9cce879b93eb2a51fa46f5ef39095689b8c37dd75998",
  sizeMb: 1,
}

export const ALL_OCR_MODELS: ReadonlyArray<ModelSpec> = [OCR_DET_MODEL, OCR_REC_MODEL, OCR_REC_DICT]

export function getOcrModelsDir(): string {
  return getModelsDir("ppocr")
}

/** 모든 텍스트 OCR 모델 다운로드/검증 (있으면 skip) */
export async function ensureOcrModels(onProgress?: ProgressHandler): Promise<void> {
  return ensureModelsIn(getOcrModelsDir(), ALL_OCR_MODELS, onProgress)
}

/** 텍스트 OCR 모델 상태 (다운로드 없이 확인만) */
export async function getOcrModelStatus(): Promise<ModelStatus[]> {
  return getModelStatusIn(getOcrModelsDir(), ALL_OCR_MODELS)
}

/**
 * inference.yml 에서 `PostProcess.character_dict` 리스트를 추출.
 * 전체 YAML 파서 없이 해당 블록의 `- <char>` 라인만 순서대로 읽는다
 * (공식 yml 구조 고정 — 들여쓰기 2칸, 한 줄 한 글자).
 *
 * CTC 클래스 배열: index 0 = blank, 1..N = 사전 순서, N+1(마지막) = space.
 */
export function parseCharacterDict(yml: string): string[] {
  const lines = yml.split("\n")
  const chars: string[] = []
  let inDict = false
  let dictIndent = -1
  for (const line of lines) {
    if (!inDict) {
      const m = /^(\s*)character_dict:\s*$/.exec(line)
      if (m) {
        inDict = true
        dictIndent = m[1].length
      }
      continue
    }
    // 리스트 항목 — YAML 은 키와 같은 들여쓰기의 "- x" 도 허용 (공식 yml 실측: 둘 다 2칸)
    const m = /^(\s*)- (.*)$/.exec(line)
    if (m && m[1].length >= dictIndent) {
      let v = m[2]
      // YAML 인용 문자 처리 ('#' 같은 예약 문자는 인용됨)
      if (v.length >= 2 && ((v.startsWith("'") && v.endsWith("'")) || (v.startsWith('"') && v.endsWith('"')))) {
        v = v.slice(1, -1).replace(/''/g, "'")
      }
      chars.push(v)
      continue
    }
    // 들여쓰기가 얕아지면 블록 종료 (빈 줄은 통과)
    if (line.trim() !== "") break
  }
  return chars
}

export function ocrModelPath(spec: ModelSpec): string {
  return join(getOcrModelsDir(), spec.filename)
}
