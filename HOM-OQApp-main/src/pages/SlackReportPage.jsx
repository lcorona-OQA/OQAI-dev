import { useState, useEffect, useCallback } from "react";
import styled from "styled-components";
import { useNavigate } from "react-router-dom";
import { UserAuth } from "../context/AuthContext";
import { supabase } from "../supabase/supabase.config";
import oqaLogo from "../assets/oqa-logo.png";
import userPlaceholder from "../assets/user-placeholder.png";
import { FaSlack, FaFilePdf, FaSync, FaHashtag, FaUser, FaCalendarAlt, FaSearch, FaCheckCircle, FaExclamationTriangle, FaSignOutAlt } from "react-icons/fa";
import jsPDF from "jspdf";
import "jspdf-autotable";

// ---------------------------------------------------------------------------
// Slack API helpers (client-side via CORS proxy or direct if token allows)
// ---------------------------------------------------------------------------

const SLACK_API = "https://slack.com/api";

const SLACK_ERROR_MESSAGES = {
  invalid_auth: "Invalid Slack token. Please check your Bot Token and try again.",
  token_revoked: "This Slack token has been revoked. Please generate a new Bot Token.",
  token_expired: "This Slack token has expired. Please generate a new Bot Token.",
  not_authed: "No authentication token provided. Please enter a valid Bot Token.",
  account_inactive: "The Slack account associated with this token has been deactivated.",
  missing_scope: "This token is missing required permissions. Ensure the bot has channels:read, channels:history, groups:read, groups:history, and users:read scopes.",
  channel_not_found: "The requested channel could not be found. It may have been deleted.",
  not_in_channel: "The bot is not a member of this channel. Please invite the bot to the channel first.",
  is_archived: "This channel has been archived and its history is no longer accessible.",
  ratelimited: "Slack rate limit reached. Please wait a moment and try again.",
  org_login_required: "Your Slack organization requires login. Please re-authenticate.",
  ekm_access_denied: "Access denied by Enterprise Key Management.",
  access_denied: "Access denied. The bot does not have permission to access this resource.",
  no_permission: "The bot does not have permission to perform this action.",
  fatal_error: "Slack experienced an internal error. Please try again later.",
  request_timeout: "The request to Slack timed out. Please check your network connection and try again.",
};

const MAX_RATE_LIMIT_RETRIES = 3;

function friendlySlackError(errorCode) {
  return SLACK_ERROR_MESSAGES[errorCode] || `Slack API error: ${errorCode}`;
}

async function slackFetch(method, token, params = {}) {
  const url = new URL(`${SLACK_API}/${method}`);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null) url.searchParams.set(k, v);
  });

  let lastError = null;
  for (let attempt = 0; attempt <= MAX_RATE_LIMIT_RETRIES; attempt++) {
    let res;
    try {
      res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (networkErr) {
      throw new Error(
        "Network error: Unable to reach Slack. Please check your internet connection and try again."
      );
    }

    // Handle HTTP-level rate limiting (429)
    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get("Retry-After") || "5", 10);
      if (attempt < MAX_RATE_LIMIT_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
        continue;
      }
      throw new Error(friendlySlackError("ratelimited"));
    }

    if (!res.ok && res.status !== 200) {
      throw new Error(
        `Slack returned HTTP ${res.status}. Please try again later.`
      );
    }

    let json;
    try {
      json = await res.json();
    } catch (parseErr) {
      throw new Error(
        "Failed to parse Slack response. The API may be temporarily unavailable."
      );
    }

    // Handle Slack-level rate limiting
    if (!json.ok && json.error === "ratelimited") {
      const retryAfter = parseInt(res.headers.get("Retry-After") || "5", 10);
      if (attempt < MAX_RATE_LIMIT_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
        continue;
      }
      throw new Error(friendlySlackError("ratelimited"));
    }

    if (!json.ok) {
      throw new Error(friendlySlackError(json.error));
    }
    return json;
  }

  throw lastError || new Error(friendlySlackError("ratelimited"));
}

async function fetchChannels(token) {
  const allChannels = [];
  let cursor = undefined;
  do {
    const res = await slackFetch("conversations.list", token, {
      types: "public_channel,private_channel",
      limit: 200,
      cursor,
    });
    allChannels.push(...(res.channels || []));
    cursor = res.response_metadata?.next_cursor || undefined;
  } while (cursor);
  return allChannels;
}

async function fetchChannelHistory(token, channelId, oldest, latest) {
  const messages = [];
  let cursor = undefined;
  do {
    const res = await slackFetch("conversations.history", token, {
      channel: channelId,
      oldest: oldest ? String(Math.floor(oldest / 1000)) : undefined,
      latest: latest ? String(Math.floor(latest / 1000)) : undefined,
      limit: 200,
      cursor,
    });
    messages.push(...(res.messages || []));
    cursor = res.response_metadata?.next_cursor || undefined;
  } while (cursor);
  return messages;
}

async function fetchUsers(token) {
  const users = [];
  let cursor = undefined;
  do {
    const res = await slackFetch("users.list", token, { limit: 200, cursor });
    users.push(...(res.members || []));
    cursor = res.response_metadata?.next_cursor || undefined;
  } while (cursor);
  return users;
}

// ---------------------------------------------------------------------------
// PDF generation
// ---------------------------------------------------------------------------

function generatePDF(reportData) {
  const { channels, dateRange, generatedAt, teamName } = reportData;

  const doc = new jsPDF("p", "mm", "a4");
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 20;

  // -- Header bar --
  doc.setFillColor(74, 21, 75); // Slack purple
  doc.rect(0, 0, pageWidth, 40, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.text("Slack Report", 14, 18);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Workspace: ${teamName || "N/A"}`, 14, 26);
  doc.text(
    `Period: ${dateRange.from || "N/A"} - ${dateRange.to || "N/A"}`,
    14,
    32
  );
  doc.text(`Generated: ${generatedAt}`, 14, 38);

  y = 50;

  // -- Summary section --
  doc.setTextColor(50, 50, 50);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("Summary", 14, y);
  y += 8;

  const totalMessages = channels.reduce(
    (sum, ch) => sum + ch.messages.length,
    0
  );
  const totalUsers = new Set(
    channels.flatMap((ch) => ch.messages.map((m) => m.userName))
  ).size;

  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text(`Total Channels Analyzed: ${channels.length}`, 14, y);
  y += 6;
  doc.text(`Total Messages: ${totalMessages}`, 14, y);
  y += 6;
  doc.text(`Active Users: ${totalUsers}`, 14, y);
  y += 12;

  // -- Per-channel detail --
  channels.forEach((channel) => {
    // Check if we need a new page
    if (y > 250) {
      doc.addPage();
      y = 20;
    }

    // Channel header
    doc.setFillColor(240, 240, 240);
    doc.rect(14, y - 5, pageWidth - 28, 10, "F");
    doc.setTextColor(74, 21, 75);
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text(`#${channel.name}`, 16, y + 2);
    doc.setTextColor(120, 120, 120);
    doc.setFontSize(9);
    doc.text(
      `${channel.messages.length} messages`,
      pageWidth - 50,
      y + 2
    );
    y += 12;

    if (channel.messages.length === 0) {
      doc.setTextColor(150, 150, 150);
      doc.setFontSize(10);
      doc.text("No messages in this period.", 16, y);
      y += 10;
      return;
    }

    // Messages table
    const tableData = channel.messages
      .sort((a, b) => parseFloat(a.ts) - parseFloat(b.ts))
      .map((msg) => [
        msg.userName || msg.user || "Unknown",
        (msg.text || "").substring(0, 120) + ((msg.text || "").length > 120 ? "..." : ""),
        new Date(parseFloat(msg.ts) * 1000).toLocaleString(),
      ]);

    doc.autoTable({
      startY: y,
      head: [["User", "Message", "Date/Time"]],
      body: tableData,
      theme: "striped",
      headStyles: {
        fillColor: [74, 21, 75],
        textColor: [255, 255, 255],
        fontSize: 9,
      },
      bodyStyles: { fontSize: 8, textColor: [50, 50, 50] },
      columnStyles: {
        0: { cellWidth: 35 },
        1: { cellWidth: "auto" },
        2: { cellWidth: 40 },
      },
      margin: { left: 14, right: 14 },
      didDrawPage: () => {
        // Footer on every page
        const pageCount = doc.internal.getNumberOfPages();
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text(
          `Page ${doc.internal.getCurrentPageInfo().pageNumber} of ${pageCount}`,
          pageWidth - 30,
          doc.internal.pageSize.getHeight() - 10
        );
      },
    });

    y = doc.lastAutoTable.finalY + 15;
  });

  // -- Top contributors section --
  doc.addPage();
  y = 20;
  doc.setTextColor(50, 50, 50);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("Top Contributors", 14, y);
  y += 10;

  const userCounts = {};
  channels.forEach((ch) =>
    ch.messages.forEach((m) => {
      const name = m.userName || m.user || "Unknown";
      userCounts[name] = (userCounts[name] || 0) + 1;
    })
  );

  const topUsers = Object.entries(userCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20);

  doc.autoTable({
    startY: y,
    head: [["#", "User", "Messages"]],
    body: topUsers.map(([name, count], i) => [i + 1, name, count]),
    theme: "striped",
    headStyles: {
      fillColor: [74, 21, 75],
      textColor: [255, 255, 255],
      fontSize: 10,
    },
    bodyStyles: { fontSize: 9 },
    columnStyles: { 0: { cellWidth: 15 }, 1: { cellWidth: 80 } },
    margin: { left: 14, right: 14 },
  });

  // -- Activity by channel chart (simple bar via rectangles) --
  y = doc.lastAutoTable.finalY + 20;
  if (y > 220) {
    doc.addPage();
    y = 20;
  }

  doc.setTextColor(50, 50, 50);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("Activity by Channel", 14, y);
  y += 10;

  const maxMsgs = Math.max(...channels.map((ch) => ch.messages.length), 1);
  const barMaxWidth = pageWidth - 80;

  channels.forEach((ch) => {
    if (y > 270) {
      doc.addPage();
      y = 20;
    }
    const barWidth = (ch.messages.length / maxMsgs) * barMaxWidth;
    doc.setFillColor(74, 21, 75);
    doc.rect(50, y - 3, barWidth, 6, "F");
    doc.setTextColor(80, 80, 80);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(`#${ch.name}`, 14, y + 1);
    doc.text(String(ch.messages.length), 52 + barWidth, y + 1);
    y += 10;
  });

  doc.save(`slack-report-${Date.now()}.pdf`);
}

// ---------------------------------------------------------------------------
// React component
// ---------------------------------------------------------------------------

export function SlackReportPage() {
  const [token, setToken] = useState("");
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [channels, setChannels] = useState([]);
  const [selectedChannels, setSelectedChannels] = useState([]);
  const [usersMap, setUsersMap] = useState({});
  const [teamInfo, setTeamInfo] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [generating, setGenerating] = useState(false);
  const [status, setStatus] = useState("");
  const [warnings, setWarnings] = useState([]);

  // Connect to Slack
  const handleConnect = useCallback(async () => {
    if (!token.trim()) {
      setError("Please enter a Slack Bot Token.");
      return;
    }
    if (!token.trim().startsWith("xoxb-") && !token.trim().startsWith("xoxp-")) {
      setError(
        "Invalid token format. Slack Bot Tokens start with 'xoxb-' and User Tokens start with 'xoxp-'. Please check your token."
      );
      return;
    }
    setLoading(true);
    setError("");
    setStatus("Connecting to Slack...");
    try {
      // Verify token by fetching team info
      const authRes = await slackFetch("auth.test", token);
      setTeamInfo(authRes.team || "Unknown Workspace");

      // Fetch channels
      setStatus("Fetching channels...");
      const channelList = await fetchChannels(token);
      setChannels(channelList);

      // Fetch users
      setStatus("Fetching users...");
      const userList = await fetchUsers(token);
      const uMap = {};
      userList.forEach((u) => {
        uMap[u.id] = u.real_name || u.name || u.id;
      });
      setUsersMap(uMap);

      setConnected(true);
      setStatus(`Connected! Found ${channelList.length} channels.`);
    } catch (err) {
      setError(err.message || "Failed to connect to Slack. Please verify your token and try again.");
      setStatus("");
    } finally {
      setLoading(false);
    }
  }, [token]);

  // Toggle channel selection
  const toggleChannel = (channelId) => {
    setSelectedChannels((prev) =>
      prev.includes(channelId)
        ? prev.filter((id) => id !== channelId)
        : [...prev, channelId]
    );
  };

  const selectAll = () => {
    const filtered = filteredChannels.map((ch) => ch.id);
    setSelectedChannels(filtered);
  };

  const deselectAll = () => {
    setSelectedChannels([]);
  };

  // Filter channels by search
  const filteredChannels = channels.filter((ch) =>
    ch.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Generate report
  const handleGenerate = useCallback(async () => {
    if (selectedChannels.length === 0) {
      setError("Please select at least one channel.");
      return;
    }
    setGenerating(true);
    setError("");
    setWarnings([]);
    setStatus("Fetching messages...");

    try {
      const oldest = dateFrom ? new Date(dateFrom).getTime() : undefined;
      const latest = dateTo
        ? new Date(dateTo + "T23:59:59").getTime()
        : undefined;

      const channelData = [];
      const channelErrors = [];
      for (let i = 0; i < selectedChannels.length; i++) {
        const chId = selectedChannels[i];
        const ch = channels.find((c) => c.id === chId);
        setStatus(
          `Fetching messages from #${ch?.name || chId} (${i + 1}/${selectedChannels.length})...`
        );
        try {
          const messages = await fetchChannelHistory(
            token,
            chId,
            oldest,
            latest
          );
          // Enrich with user names
          const enriched = messages.map((m) => ({
            ...m,
            userName: usersMap[m.user] || m.user || "Unknown",
          }));
          channelData.push({
            id: chId,
            name: ch?.name || chId,
            messages: enriched,
          });
        } catch (chErr) {
          console.warn(`Could not fetch #${ch?.name}: ${chErr.message}`);
          channelErrors.push(`#${ch?.name || chId}: ${chErr.message}`);
          channelData.push({
            id: chId,
            name: ch?.name || chId,
            messages: [],
          });
        }
      }

      if (channelErrors.length > 0) {
        setWarnings(channelErrors);
      }

      if (channelData.every((ch) => ch.messages.length === 0) && channelErrors.length > 0) {
        setError(
          "Could not fetch messages from any of the selected channels. Please check that the bot has been invited to these channels and has the required permissions."
        );
        setStatus("");
        return;
      }

      setStatus("Generating PDF...");

      generatePDF({
        channels: channelData,
        dateRange: {
          from: dateFrom || "All time",
          to: dateTo || "Present",
        },
        generatedAt: new Date().toLocaleString(),
        teamName: teamInfo,
      });

      setStatus(
        channelErrors.length > 0
          ? `PDF generated with warnings — ${channelErrors.length} channel(s) could not be fetched.`
          : "PDF generated and downloaded successfully!"
      );
    } catch (err) {
      setError(err.message || "Failed to generate report. Please try again.");
      setStatus("");
    } finally {
      setGenerating(false);
    }
  }, [selectedChannels, channels, token, usersMap, dateFrom, dateTo, teamInfo]);

  return (
    <MainContent>
      <SlackSidebar />
      <ContentArea>
        <PageHeader>
          <HeaderIcon>
            <FaSlack size={28} />
          </HeaderIcon>
          <div>
            <PageTitle>Slack Report Generator</PageTitle>
            <PageSubtitle>
              Connect to Slack, select channels, and generate a PDF report
            </PageSubtitle>
          </div>
        </PageHeader>

        {/* Connection Section */}
        {!connected ? (
          <Card>
            <CardTitle>
              <FaSlack /> Connect to Slack
            </CardTitle>
            <TokenInputWrapper>
              <TokenInput
                type="password"
                placeholder="Enter your Slack Bot Token (xoxb-...)"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleConnect()}
              />
              <ConnectButton onClick={handleConnect} disabled={loading}>
                {loading ? <FaSync className="spin" /> : <FaSlack />}
                {loading ? "Connecting..." : "Connect"}
              </ConnectButton>
            </TokenInputWrapper>
            <HelpText>
              You need a Slack Bot Token with the following scopes:{" "}
              <code>channels:read</code>, <code>channels:history</code>,{" "}
              <code>groups:read</code>, <code>groups:history</code>,{" "}
              <code>users:read</code>
            </HelpText>
          </Card>
        ) : (
          <>
            {/* Connected Status */}
            <ConnectedBanner>
              <FaCheckCircle />
              <span>
                Connected to <strong>{teamInfo}</strong> &mdash;{" "}
                {channels.length} channels found
              </span>
              <DisconnectButton
                onClick={() => {
                  setConnected(false);
                  setChannels([]);
                  setSelectedChannels([]);
                  setToken("");
                  setStatus("");
                  setError("");
                  setWarnings([]);
                }}
              >
                Disconnect
              </DisconnectButton>
            </ConnectedBanner>

            {/* Date Range */}
            <Card>
              <CardTitle>
                <FaCalendarAlt /> Date Range
              </CardTitle>
              <DateRow>
                <DateField>
                  <label>From</label>
                  <DateInput
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                  />
                </DateField>
                <DateField>
                  <label>To</label>
                  <DateInput
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                  />
                </DateField>
              </DateRow>
            </Card>

            {/* Channel Selection */}
            <Card>
              <CardTitle>
                <FaHashtag /> Select Channels
                <ChannelCount>
                  {selectedChannels.length} of {channels.length} selected
                </ChannelCount>
              </CardTitle>
              <SearchRow>
                <SearchInputWrapper>
                  <FaSearch />
                  <SearchInput
                    type="text"
                    placeholder="Search channels..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </SearchInputWrapper>
                <SelectActions>
                  <ActionButton onClick={selectAll}>Select All</ActionButton>
                  <ActionButton onClick={deselectAll}>
                    Deselect All
                  </ActionButton>
                </SelectActions>
              </SearchRow>
              <ChannelGrid>
                {filteredChannels.map((ch) => (
                  <ChannelItem
                    key={ch.id}
                    selected={selectedChannels.includes(ch.id)}
                    onClick={() => toggleChannel(ch.id)}
                  >
                    <ChannelCheckbox
                      checked={selectedChannels.includes(ch.id)}
                    />
                    <ChannelName>#{ch.name}</ChannelName>
                    <ChannelMembers>
                      <FaUser size={10} /> {ch.num_members || 0}
                    </ChannelMembers>
                  </ChannelItem>
                ))}
              </ChannelGrid>
            </Card>

            {/* Generate Button */}
            <GenerateSection>
              <GenerateButton
                onClick={handleGenerate}
                disabled={generating || selectedChannels.length === 0}
              >
                {generating ? (
                  <FaSync className="spin" />
                ) : (
                  <FaFilePdf />
                )}
                {generating ? "Generating Report..." : "Generate PDF Report"}
              </GenerateButton>
            </GenerateSection>
          </>
        )}

        {/* Status & Error */}
        {status && (
          <StatusBar>
            <FaCheckCircle /> {status}
          </StatusBar>
        )}
        {warnings.length > 0 && (
          <WarningBar>
            <FaExclamationTriangle />
            <WarningContent>
              <span>Some channels could not be fetched:</span>
              <WarningList>
                {warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </WarningList>
            </WarningContent>
          </WarningBar>
        )}
        {error && (
          <ErrorBar>
            <FaExclamationTriangle /> {error}
          </ErrorBar>
        )}
      </ContentArea>
    </MainContent>
  );
}

// ---------------------------------------------------------------------------
// Slack Sidebar (dedicated sidebar for role 11 users)
// ---------------------------------------------------------------------------

function SlackSidebar() {
  const { signout, user } = UserAuth();
  const navigate = useNavigate();
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  const handleSignout = async () => {
    try {
      await signout();
      navigate("/login");
    } catch (error) {
      console.error("Error al cerrar sesión:", error);
    }
  };

  const userPhoto = user?.user_metadata?.picture || userPlaceholder;

  return (
    <SidebarContainer>
      <SidebarLogo src={oqaLogo} alt="OQA logo" />
      <SidebarNavItems>
        <SidebarNavItem active>
          <FaSlack />
          <SidebarTooltip className="tooltip">Slack Report</SidebarTooltip>
        </SidebarNavItem>
      </SidebarNavItems>
      <SidebarBottomSection>
        <SidebarProfile
          onMouseEnter={() => setShowProfileMenu(true)}
          onMouseLeave={() => setShowProfileMenu(false)}
        >
          <SidebarProfilePic src={userPhoto} />
          <SidebarOnlineStatus />
          {showProfileMenu && (
            <SidebarProfileMenu>
              <SidebarProfileMenuItem onClick={handleSignout}>
                <FaSignOutAlt />
                Cerrar Sesión
              </SidebarProfileMenuItem>
            </SidebarProfileMenu>
          )}
        </SidebarProfile>
      </SidebarBottomSection>
    </SidebarContainer>
  );
}

// ---------------------------------------------------------------------------
// Styled Components
// ---------------------------------------------------------------------------

const SidebarContainer = styled.div`
  background-color: #2b2f38;
  padding: 25px 0;
  display: flex;
  height: 100vh;
  border-top-right-radius: 25px;
  border-bottom-right-radius: 25px;
  box-shadow: 2px 0 5px rgba(0, 0, 0, 0.35);
  flex-direction: column;
  justify-content: space-between;
  align-items: center;
`;

const SidebarLogo = styled.img`
  width: 50px;
`;

const SidebarNavItems = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 15px;
`;

const SidebarNavItem = styled.div`
  position: relative;
  color: ${(props) => (props.active ? "#F7D000" : "#8c8c8c")};
  font-size: 1.375rem;
  padding: 10px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.3s ease-in-out;
  background-color: ${(props) => (props.active ? "#3e4450" : "transparent")};

  &:hover {
    background-color: #3e4450;
  }
`;

const SidebarTooltip = styled.span`
  opacity: 0;
  visibility: hidden;
  position: absolute;
  left: 60px;
  background-color: #3e4450;
  color: #fff;
  padding: 5px 10px;
  border-radius: 4px;
  font-size: 0.9rem;
  white-space: nowrap;
  z-index: 5;
  transition: opacity 0.2s ease, visibility 0.2s ease;

  ${SidebarNavItem}:hover & {
    opacity: 1;
    visibility: visible;
  }
`;

const SidebarBottomSection = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 15px;
`;

const SidebarProfile = styled.div`
  position: relative;
  width: 50px;
  height: 50px;
  border-radius: 50%;
  border: 2px solid #fff;
  cursor: pointer;
`;

const SidebarProfilePic = styled.img`
  width: 100%;
  height: 100%;
  border-radius: 50%;
  object-fit: cover;
`;

const SidebarOnlineStatus = styled.div`
  position: absolute;
  bottom: 0;
  right: 0;
  width: 12px;
  height: 12px;
  background-color: #28a745;
  border-radius: 50%;
  border: 2px solid #2b2f38;
`;

const SidebarProfileMenu = styled.div`
  position: absolute;
  top: 50%;
  left: 45px;
  transform: translateY(-50%);
  background-color: #2b2f38;
  border-radius: 8px;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.3);
  padding: 10px;
  white-space: nowrap;
  z-index: 10;
`;

const SidebarProfileMenuItem = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-radius: 6px;
  color: #8c8c8c;
  cursor: pointer;

  &:hover {
    background-color: #3e4450;
    color: #ff0000;
  }

  svg {
    font-size: 1.2rem;
  }
`;

const MainContent = styled.div`
  display: grid;
  grid-template-columns: 80px 1fr;
  width: 100vw;
  height: 100vh;
  background-color: #1a1d23;
  overflow: hidden;
`;

const ContentArea = styled.div`
  padding: 30px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 20px;

  &::-webkit-scrollbar {
    width: 8px;
  }
  &::-webkit-scrollbar-track {
    background: transparent;
  }
  &::-webkit-scrollbar-thumb {
    background: #3e4450;
    border-radius: 4px;
  }
`;

const PageHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
`;

const HeaderIcon = styled.div`
  width: 52px;
  height: 52px;
  border-radius: 12px;
  background: linear-gradient(135deg, #4a154b, #611f69);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
`;

const PageTitle = styled.h1`
  font-size: 1.6rem;
  color: #ffffff;
  margin: 0;
  font-weight: 700;
`;

const PageSubtitle = styled.p`
  font-size: 0.9rem;
  color: #8c8c8c;
  margin: 4px 0 0 0;
`;

const Card = styled.div`
  background: #2b2f38;
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.3);
`;

const CardTitle = styled.h2`
  font-size: 1.1rem;
  color: #ffffff;
  margin: 0 0 16px 0;
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 600;

  svg {
    color: #f7d000;
  }
`;

const TokenInputWrapper = styled.div`
  display: flex;
  gap: 12px;
`;

const TokenInput = styled.input`
  flex: 1;
  padding: 12px 16px;
  border-radius: 8px;
  border: 1px solid #3e4450;
  background: #1a1d23;
  color: #fff;
  font-size: 0.95rem;
  outline: none;
  transition: border-color 0.2s;

  &:focus {
    border-color: #f7d000;
  }

  &::placeholder {
    color: #666;
  }
`;

const ConnectButton = styled.button`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 24px;
  border-radius: 8px;
  border: none;
  background: linear-gradient(135deg, #4a154b, #611f69);
  color: #fff;
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.2s, transform 0.1s;
  white-space: nowrap;

  &:hover {
    opacity: 0.9;
    transform: translateY(-1px);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }

  .spin {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
`;

const HelpText = styled.p`
  color: #8c8c8c;
  font-size: 0.8rem;
  margin: 12px 0 0 0;

  code {
    background: #1a1d23;
    padding: 2px 6px;
    border-radius: 4px;
    color: #f7d000;
    font-size: 0.75rem;
  }
`;

const ConnectedBanner = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  background: #1a3a2a;
  border: 1px solid #28a745;
  border-radius: 10px;
  padding: 14px 20px;
  color: #28a745;
  font-size: 0.95rem;

  svg {
    font-size: 1.2rem;
  }

  strong {
    color: #4caf50;
  }
`;

const DisconnectButton = styled.button`
  margin-left: auto;
  padding: 6px 16px;
  border-radius: 6px;
  border: 1px solid #666;
  background: transparent;
  color: #ccc;
  font-size: 0.85rem;
  cursor: pointer;

  &:hover {
    border-color: #ff4444;
    color: #ff4444;
  }
`;

const DateRow = styled.div`
  display: flex;
  gap: 20px;
`;

const DateField = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1;

  label {
    color: #8c8c8c;
    font-size: 0.85rem;
  }
`;

const DateInput = styled.input`
  padding: 10px 14px;
  border-radius: 8px;
  border: 1px solid #3e4450;
  background: #1a1d23;
  color: #fff;
  font-size: 0.9rem;
  outline: none;

  &:focus {
    border-color: #f7d000;
  }

  &::-webkit-calendar-picker-indicator {
    filter: invert(1);
  }
`;

const SearchRow = styled.div`
  display: flex;
  gap: 12px;
  align-items: center;
  margin-bottom: 14px;
`;

const SearchInputWrapper = styled.div`
  flex: 1;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-radius: 8px;
  border: 1px solid #3e4450;
  background: #1a1d23;
  color: #8c8c8c;

  &:focus-within {
    border-color: #f7d000;
  }
`;

const SearchInput = styled.input`
  flex: 1;
  border: none;
  background: transparent;
  color: #fff;
  font-size: 0.9rem;
  outline: none;

  &::placeholder {
    color: #666;
  }
`;

const SelectActions = styled.div`
  display: flex;
  gap: 8px;
`;

const ActionButton = styled.button`
  padding: 8px 14px;
  border-radius: 6px;
  border: 1px solid #3e4450;
  background: transparent;
  color: #ccc;
  font-size: 0.8rem;
  cursor: pointer;

  &:hover {
    border-color: #f7d000;
    color: #f7d000;
  }
`;

const ChannelGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 8px;
  max-height: 300px;
  overflow-y: auto;
  padding-right: 4px;

  &::-webkit-scrollbar {
    width: 6px;
  }
  &::-webkit-scrollbar-thumb {
    background: #3e4450;
    border-radius: 3px;
  }
`;

const ChannelItem = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-radius: 8px;
  border: 1px solid ${(p) => (p.selected ? "#f7d000" : "#3e4450")};
  background: ${(p) => (p.selected ? "rgba(247, 208, 0, 0.08)" : "transparent")};
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    border-color: #f7d000;
    background: rgba(247, 208, 0, 0.04);
  }
`;

const ChannelCheckbox = styled.div`
  width: 18px;
  height: 18px;
  border-radius: 4px;
  border: 2px solid ${(p) => (p.checked ? "#f7d000" : "#555")};
  background: ${(p) => (p.checked ? "#f7d000" : "transparent")};
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;

  &::after {
    content: "${(p) => (p.checked ? "\\2713" : "")}";
    color: #1a1d23;
    font-size: 12px;
    font-weight: bold;
  }
`;

const ChannelName = styled.span`
  color: #e0e0e0;
  font-size: 0.9rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const ChannelMembers = styled.span`
  margin-left: auto;
  color: #666;
  font-size: 0.75rem;
  display: flex;
  align-items: center;
  gap: 4px;
`;

const GenerateSection = styled.div`
  display: flex;
  justify-content: center;
  padding: 10px 0;
`;

const GenerateButton = styled.button`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 40px;
  border-radius: 10px;
  border: none;
  background: linear-gradient(135deg, #f7d000, #e6b800);
  color: #1a1d23;
  font-size: 1.05rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 4px 15px rgba(247, 208, 0, 0.3);

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(247, 208, 0, 0.4);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
    box-shadow: none;
  }

  .spin {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
`;

const StatusBar = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 18px;
  border-radius: 8px;
  background: #1a3a2a;
  color: #4caf50;
  font-size: 0.9rem;
`;

const ErrorBar = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 18px;
  border-radius: 8px;
  background: #3a1a1a;
  color: #ff6b6b;
  font-size: 0.9rem;
`;

const WarningBar = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 12px 18px;
  border-radius: 8px;
  background: #3a2e1a;
  color: #ffb347;
  font-size: 0.9rem;

  svg {
    flex-shrink: 0;
    margin-top: 2px;
  }
`;

const WarningContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const WarningList = styled.ul`
  margin: 0;
  padding-left: 18px;
  font-size: 0.85rem;
  color: #e0c080;
`;
