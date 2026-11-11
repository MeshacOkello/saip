import PDFDocument from "pdfkit";
import { NextResponse } from "next/server";

import { currentBoardYear } from "@/lib/board";
import { formatAmount } from "@/lib/finance/service";
import { currentMember } from "@/lib/session";
import { handoverPacket } from "@/lib/transition/service";

export const runtime = "nodejs";

const INK = "#18251f";
const MUTED = "#56675e";
const RULE = "#dce5dd";

/**
 * A handover packet as a PDF, generated here rather than by a service: everything
 * in it is already in the database, and a departing officer should be able to hand
 * over a file without an account anywhere.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ positionId: string }> },
) {
  const member = await currentMember();
  if (!member) return new NextResponse("Not signed in", { status: 401 });
  if (!member.capabilities.has("members.manage")) {
    return new NextResponse("Not allowed", { status: 403 });
  }

  const { positionId } = await params;
  const url = new URL(request.url);
  const year =
    (await currentBoardYear()) ??
    (() => {
      throw new Error("no board year");
    })();
  const boardYearId = url.searchParams.get("year") ?? year.id;

  const packet = await handoverPacket(positionId, boardYearId);
  if (!packet) return new NextResponse("No such position", { status: 404 });

  const pdf = new PDFDocument({ size: "A4", margin: 56 });
  const chunks: Buffer[] = [];
  pdf.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve) => {
    pdf.on("end", () => resolve(Buffer.concat(chunks)));
  });

  const width = pdf.page.width - 112;

  const rule = () => {
    pdf.moveDown(0.5);
    pdf
      .strokeColor(RULE)
      .lineWidth(1)
      .moveTo(56, pdf.y)
      .lineTo(56 + width, pdf.y)
      .stroke();
    pdf.moveDown(0.7);
  };

  const heading = (text: string) => {
    if (pdf.y > pdf.page.height - 140) pdf.addPage();
    pdf.moveDown(0.6);
    pdf.fillColor(MUTED).fontSize(9).font("Helvetica-Bold").text(text.toUpperCase(), {
      characterSpacing: 1.1,
    });
    pdf.moveDown(0.35);
    pdf.fillColor(INK).fontSize(11).font("Helvetica");
  };

  const line = (left: string, right?: string) => {
    if (pdf.y > pdf.page.height - 90) pdf.addPage();
    const y = pdf.y;
    pdf.fillColor(INK).fontSize(11).font("Helvetica").text(left, 56, y, {
      width: right ? width - 150 : width,
    });
    if (right) {
      pdf
        .fillColor(MUTED)
        .fontSize(10)
        .text(right, 56 + width - 150, y, { width: 150, align: "right" });
    }
    pdf.moveDown(0.35);
  };

  // Header
  pdf
    .fillColor(MUTED)
    .fontSize(10)
    .font("Helvetica")
    .text("Society for African Internationals at Princeton");
  pdf.moveDown(0.15);
  pdf.fillColor(INK).fontSize(22).font("Helvetica-Bold").text("Handover packet");
  pdf.moveDown(0.25);
  pdf
    .fillColor(INK)
    .fontSize(15)
    .font("Helvetica-Bold")
    .text(packet.position.name);
  pdf.moveDown(0.15);
  pdf
    .fillColor(MUTED)
    .fontSize(10)
    .font("Helvetica")
    .text(
      [
        packet.holder ? packet.holder.name : "Position vacant",
        packet.holder?.email,
        `Board year ${year.label}`,
        `Generated ${new Date().toISOString().slice(0, 10)}`,
      ]
        .filter(Boolean)
        .join("  ·  "),
    );
  rule();

  if (packet.position.description) {
    heading("What this position is for");
    pdf.fillColor(INK).fontSize(11).text(packet.position.description, { width });
    pdf.moveDown(0.3);
  }

  const duties = (packet.position.responsibilities ?? "")
    .split("\n")
    .map((d) => d.trim())
    .filter(Boolean);
  if (duties.length > 0) {
    heading("Responsibilities");
    for (const duty of duties) line(`•  ${duty}`);
  }

  heading(`Still to do · ${packet.tasks.length}`);
  if (packet.tasks.length === 0) {
    pdf.fillColor(MUTED).fontSize(11).text("Nothing outstanding.");
  } else {
    for (const task of packet.tasks) {
      line(
        `•  ${task.title}`,
        [task.eventTitle, task.dueOn ?? "no date"].filter(Boolean).join(" · "),
      );
    }
  }

  heading(`Events led · ${packet.events.length}`);
  if (packet.events.length === 0) {
    pdf.fillColor(MUTED).fontSize(11).text("None this year.");
  } else {
    for (const item of packet.events) {
      line(
        `•  ${item.title}`,
        [
          item.startsAt ? item.startsAt.toISOString().slice(0, 10) : "no date",
          item.status,
        ].join(" · "),
      );
    }
  }

  const owed = packet.money.reduce((sum, m) => sum + m.amount, 0);
  heading(`Money not yet back · ${formatAmount(owed)}`);
  if (packet.money.length === 0) {
    pdf.fillColor(MUTED).fontSize(11).text("Nothing in flight.");
  } else {
    for (const claim of packet.money) {
      line(
        `•  ${claim.description}`,
        `${formatAmount(claim.amount)} · ${claim.status.replace(/_/g, " ")}`,
      );
    }
  }

  rule();
  pdf
    .fillColor(MUTED)
    .fontSize(9)
    .text(
      "Assembled from SAIP's own records at the moment of download. Prime and Concur " +
        "remain the University's systems of record for anything financial.",
      { width },
    );

  pdf.end();
  const body = await done;

  const safe = packet.position.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return new NextResponse(new Uint8Array(body), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="saip-handover-${safe}-${year.label.replace("/", "-")}.pdf"`,
      "cache-control": "no-store",
    },
  });
}
