#!/bin/bash
# 测试需求变更功能综合测试脚本
BASE="http://localhost:8080/api"
PASS=0
FAIL=0
TOTAL=0

# 颜色输出
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

login() {
  local user=$1
  local pass=$2
  curl -s -X POST "$BASE/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"$user\",\"password\":\"$pass\"}" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['token'])" 2>/dev/null
}

api() {
  local method=$1
  local path=$2
  local token=$3
  local data=$4
  if [ -n "$data" ]; then
    curl -s -X "$method" "$BASE$path" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $token" \
      -d "$data"
  else
    curl -s -X "$method" "$BASE$path" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $token"
  fi
}

assert_contains() {
  local desc=$1
  local response=$2
  local expected=$3
  TOTAL=$((TOTAL + 1))
  if echo "$response" | grep -q "$expected"; then
    echo -e "${GREEN}✓ PASS${NC}: $desc"
    PASS=$((PASS + 1))
  else
    echo -e "${RED}✗ FAIL${NC}: $desc (expected: $expected)"
    echo "  Response: $(echo "$response" | head -c 300)"
    FAIL=$((FAIL + 1))
  fi
}

assert_not_contains() {
  local desc=$1
  local response=$2
  local unexpected=$3
  TOTAL=$((TOTAL + 1))
  if echo "$response" | grep -q "$unexpected"; then
    echo -e "${RED}✗ FAIL${NC}: $desc (should NOT contain: $unexpected)"
    echo "  Response: $(echo "$response" | head -c 300)"
    FAIL=$((FAIL + 1))
  else
    echo -e "${GREEN}✓ PASS${NC}: $desc"
    PASS=$((PASS + 1))
  fi
}

echo "=========================================="
echo " 测试需求变更功能 - 综合测试"
echo "=========================================="
echo ""

# Step 1: 登录所有角色
echo -e "${YELLOW}=== Step 1: 登录获取 Token ===${NC}"
ADMIN_TOKEN=$(login "admin" "admin123")
TM_TOKEN=$(login "testmanager" "test123")
PM_TOKEN=$(login "projectmanager" "project123")
RM_TOKEN=$(login "resourcemanager" "resource123")
TE_TOKEN=$(login "testexecutor" "test123")
TL_TOKEN=$(login "testlead" "test123")

assert_not_contains "admin 登录成功" "$ADMIN_TOKEN" "null"
assert_not_contains "testmanager 登录成功" "$TM_TOKEN" "null"
assert_not_contains "projectmanager 登录成功" "$PM_TOKEN" "null"
assert_not_contains "resourcemanager 登录成功" "$RM_TOKEN" "null"
assert_not_contains "testexecutor 登录成功" "$TE_TOKEN" "null"
assert_not_contains "testlead 登录成功" "$TL_TOKEN" "null"

echo ""
echo -e "${YELLOW}=== Step 2: 创建测试需求 ===${NC}"

# 创建一个需求
CREATE_RESP=$(api POST "/demands" "$TM_TOKEN" '{
  "product": "变更测试产品",
  "version": "V1.0",
  "startDate": "2026-08-01T00:00:00",
  "endDate": "2026-08-31T00:00:00",
  "versionType": "在研",
  "versionPhase": "第一版",
  "description": "用于测试变更功能的需求",
  "priority": "高",
  "manpowerDemand": 10,
  "manpowerDetails": [
    {"testType": "功能测试", "manpowerDemand": 6, "remark": ""},
    {"testType": "自动化测试", "manpowerDemand": 4, "remark": ""}
  ]
}')
assert_contains "创建需求成功" "$CREATE_RESP" '"code":200'

# 提取需求 ID
DEMAND_ID=$(echo "$CREATE_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['id'])" 2>/dev/null)
echo "  创建的需求 ID: $DEMAND_ID"

# 获取需求详情确认状态为 submitted
DEMAND_DETAIL=$(api GET "/demands/$DEMAND_ID" "$TM_TOKEN")
assert_contains "需求状态为 submitted" "$DEMAND_DETAIL" '"submitted"'

echo ""
echo -e "${YELLOW}=== Step 3: 审批需求进入 pending 状态 ===${NC}"

# 项目经理审批
APPROVE_RESP=$(api PUT "/demands/$DEMAND_ID/approve" "$PM_TOKEN")
assert_contains "审批需求成功" "$APPROVE_RESP" '"code":200'
assert_contains "需求状态变为 pending" "$APPROVE_RESP" '"pending"'

echo ""
echo -e "${YELLOW}=== Step 4: 测试变更提交功能 ===${NC}"

# 4.1 正常提交变更
echo "--- 4.1 正常提交变更 ---"
REVISION_RESP=$(api PUT "/demands/$DEMAND_ID/revision" "$TM_TOKEN" '{
  "startDate": "2026-08-05T00:00:00",
  "endDate": "2026-08-25T00:00:00",
  "manpowerDetails": [
    {"testType": "功能测试", "manpowerDemand": 8, "remark": ""},
    {"testType": "自动化测试", "manpowerDemand": 3, "remark": ""}
  ]
}')
assert_contains "提交变更成功" "$REVISION_RESP" '"code":200'
assert_contains "状态变为 revision_pending" "$REVISION_RESP" '"revision_pending"'

# 4.2 获取变更对比
echo "--- 4.2 获取变更对比 ---"
DIFF_RESP=$(api GET "/demands/$DEMAND_ID/revision-diff" "$TM_TOKEN")
assert_contains "获取变更对比成功" "$DIFF_RESP" '"code":200'
assert_contains "变更对比包含需求ID" "$DIFF_RESP" "\"demandId\":$DEMAND_ID"

# 4.3 获取变更待审批列表
echo "--- 4.3 获取变更待审批列表 ---"
PENDING_RESP=$(api GET "/demands/revision-pending-approval" "$PM_TOKEN")
assert_contains "获取变更待审批列表成功" "$PENDING_RESP" '"code":200'
assert_contains "列表包含变更中的需求" "$PENDING_RESP" "\"id\":$DEMAND_ID"

echo ""
echo -e "${YELLOW}=== Step 5: 测试变更审批功能 ===${NC}"

# 5.1 审批通过
echo "--- 5.1 测试批准变更 ---"
APPROVE_REV_RESP=$(api PUT "/demands/$DEMAND_ID/approve-revision" "$PM_TOKEN")
assert_contains "批准变更成功" "$APPROVE_REV_RESP" '"code":200'
# 应该变为 pending（因为没有排班记录）
assert_contains "状态变为 pending" "$APPROVE_REV_RESP" '"pending"'

# 5.2 再次提交变更，测试退回
echo "--- 5.2 再次提交变更用于测试退回 ---"
REVISION2=$(api PUT "/demands/$DEMAND_ID/revision" "$TM_TOKEN" '{
  "startDate": "2026-08-10T00:00:00",
  "endDate": "2026-08-20T00:00:00",
  "manpowerDetails": [
    {"testType": "功能测试", "manpowerDemand": 5, "remark": ""},
    {"testType": "自动化测试", "manpowerDemand": 2, "remark": ""}
  ]
}')
assert_contains "再次提交变更成功" "$REVISION2" '"revision_pending"'

# 5.3 退回变更
echo "--- 5.3 测试退回变更 ---"
REJECT_RESP=$(api PUT "/demands/$DEMAND_ID/reject-revision" "$PM_TOKEN")
assert_contains "退回变更成功" "$REJECT_RESP" '"code":200'

# 检查退回后的状态
REJECTED_DETAIL=$(api GET "/demands/$DEMAND_ID" "$TM_TOKEN")
assert_contains "退回后状态为 rejected" "$REJECTED_DETAIL" '"rejected"'

# 5.4 修改后批准测试
echo "--- 5.4 重新提交并测试修改后批准 ---"
# 先重新提交
RESUBMIT=$(api PUT "/demands/$DEMAND_ID/resubmit" "$TM_TOKEN")
assert_contains "重新提交成功" "$RESUBMIT" '"submitted"'

# 审批通过
APPROVE2=$(api PUT "/demands/$DEMAND_ID/approve" "$PM_TOKEN")
assert_contains "审批通过" "$APPROVE2" '"pending"'

# 再次提交变更
REVISION3=$(api PUT "/demands/$DEMAND_ID/revision" "$TM_TOKEN" '{
  "startDate": "2026-08-01T00:00:00",
  "endDate": "2026-08-31T00:00:00",
  "manpowerDetails": [
    {"testType": "功能测试", "manpowerDemand": 7, "remark": ""},
    {"testType": "自动化测试", "manpowerDemand": 3, "remark": ""}
  ]
}')
assert_contains "第三次提交变更成功" "$REVISION3" '"revision_pending"'

# 修改后批准
APPROVE_MOD=$(api PUT "/demands/$DEMAND_ID/approve-revision-with-changes" "$PM_TOKEN" '{
  "manpowerDetails": [
    {"testType": "功能测试", "manpowerDemand": 10, "remark": ""},
    {"testType": "自动化测试", "manpowerDemand": 5, "remark": ""}
  ]
}')
assert_contains "修改后批准成功" "$APPROVE_MOD" '"code":200'

echo ""
echo -e "${YELLOW}=== Step 6: 测试权限控制 ===${NC}"

# 先把需求再次置于 pending 状态
REVISION4=$(api PUT "/demands/$DEMAND_ID/revision" "$TM_TOKEN" '{
  "startDate": "2026-08-01T00:00:00",
  "endDate": "2026-08-31T00:00:00",
  "manpowerDetails": [
    {"testType": "功能测试", "manpowerDemand": 6, "remark": ""},
    {"testType": "自动化测试", "manpowerDemand": 4, "remark": ""}
  ]
}')

# 6.1 testExecutor 不能提交变更
echo "--- 6.1 测试权限：testExecutor 不能提交变更 ---"
# 先批准回 pending
if echo "$REVISION4" | grep -q "revision_pending"; then
  api PUT "/demands/$DEMAND_ID/approve-revision" "$PM_TOKEN" > /dev/null
fi

PERM1=$(api PUT "/demands/$DEMAND_ID/revision" "$TE_TOKEN" '{
  "startDate": "2026-08-01T00:00:00",
  "endDate": "2026-08-31T00:00:00",
  "manpowerDetails": []
}')
assert_contains "testExecutor 不能提交变更" "$PERM1" '"code":403'

# 6.2 testLead 不能提交变更
echo "--- 6.2 测试权限：testLead 不能提交变更 ---"
PERM2=$(api PUT "/demands/$DEMAND_ID/revision" "$TL_TOKEN" '{
  "startDate": "2026-08-01T00:00:00",
  "endDate": "2026-08-31T00:00:00",
  "manpowerDetails": []
}')
assert_contains "testLead 不能提交变更" "$PERM2" '"code":403'

# 6.3 resourceManager 不能提交变更
echo "--- 6.3 测试权限：resourceManager 不能提交变更 ---"
PERM3=$(api PUT "/demands/$DEMAND_ID/revision" "$RM_TOKEN" '{
  "startDate": "2026-08-01T00:00:00",
  "endDate": "2026-08-31T00:00:00",
  "manpowerDetails": []
}')
assert_contains "resourceManager 不能提交变更" "$PERM3" '"code":403'

# 6.4 testManager 不能审批变更
echo "--- 6.4 测试权限：testManager 不能审批变更 ---"
# 先提交一个变更
REVISION5=$(api PUT "/demands/$DEMAND_ID/revision" "$TM_TOKEN" '{
  "startDate": "2026-08-01T00:00:00",
  "endDate": "2026-08-31T00:00:00",
  "manpowerDetails": [
    {"testType": "功能测试", "manpowerDemand": 6, "remark": ""},
    {"testType": "自动化测试", "manpowerDemand": 4, "remark": ""}
  ]
}')
assert_contains "提交变更成功" "$REVISION5" '"revision_pending"'

PERM4=$(api PUT "/demands/$DEMAND_ID/approve-revision" "$TM_TOKEN")
assert_contains "testManager 不能审批变更" "$PERM4" '"code":403'

# 6.5 testExecutor 不能审批变更
echo "--- 6.5 测试权限：testExecutor 不能审批变更 ---"
PERM5=$(api PUT "/demands/$DEMAND_ID/approve-revision" "$TE_TOKEN")
assert_contains "testExecutor 不能审批变更" "$PERM5" '"code":403'

# 6.6 resourceManager 可以审批变更
echo "--- 6.6 测试权限：resourceManager 可以审批变更 ---"
PERM6=$(api PUT "/demands/$DEMAND_ID/approve-revision" "$RM_TOKEN")
assert_contains "resourceManager 可以审批变更" "$PERM6" '"code":200'

echo ""
echo -e "${YELLOW}=== Step 7: 测试业务规则校验 ===${NC}"

# 7.1 已完成的需求不能提交变更
echo "--- 7.1 测试状态校验：completed 状态不能变更 ---"
# 先创建排班使需求可以变为 scheduled 状态
STAFF_RESP=$(api GET "/staff/active" "$TM_TOKEN")
STAFF_ID=$(echo "$STAFF_RESP" | python3 -c "import sys,json; staff=json.load(sys.stdin); print(staff[0]['id'])" 2>/dev/null)
echo "  使用测试人员 ID: $STAFF_ID"

# 创建排班
SCHEDULE_RESP=$(api POST "/schedules" "$TM_TOKEN" "{
  \"staffId\": $STAFF_ID,
  \"demandId\": $DEMAND_ID,
  \"date\": \"2026-08-15\",
  \"percentage\": 50
}")
echo "  创建排班: $(echo "$SCHEDULE_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('code','?'))" 2>/dev/null)"

# 关闭需求变为 completed
CLOSE_RESP=$(api POST "/demands/$DEMAND_ID/close" "$TM_TOKEN")
echo "  关闭需求: $(echo "$CLOSE_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('code','?'))" 2>/dev/null)"

RULE1=$(api PUT "/demands/$DEMAND_ID/revision" "$TM_TOKEN" '{
  "startDate": "2026-08-01T00:00:00",
  "endDate": "2026-08-31T00:00:00",
  "manpowerDetails": []
}')
assert_contains "completed 状态不能提交变更" "$RULE1" '"code":400'

# 7.2 submitted 状态不能提交变更
echo "--- 7.2 测试状态校验：submitted 状态不能变更 ---"
# 创建新需求
CREATE2=$(api POST "/demands" "$TM_TOKEN" '{
  "product": "变更测试产品2",
  "version": "V2.0",
  "startDate": "2026-09-01T00:00:00",
  "endDate": "2026-09-30T00:00:00",
  "versionType": "在研",
  "versionPhase": "第一版",
  "priority": "中",
  "manpowerDemand": 5,
  "manpowerDetails": [
    {"testType": "功能测试", "manpowerDemand": 5, "remark": ""}
  ]
}')
DEMAND_ID2=$(echo "$CREATE2" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['id'])" 2>/dev/null)

RULE2=$(api PUT "/demands/$DEMAND_ID2/revision" "$TM_TOKEN" '{
  "startDate": "2026-09-01T00:00:00",
  "endDate": "2026-09-30T00:00:00",
  "manpowerDetails": []
}')
assert_contains "submitted 状态不能提交变更" "$RULE2" '"code":400'

# 7.3 rejected 状态不能提交变更
echo "--- 7.3 测试状态校验：rejected 状态不能变更 ---"
api PUT "/demands/$DEMAND_ID2/reject" "$PM_TOKEN" > /dev/null

RULE3=$(api PUT "/demands/$DEMAND_ID2/revision" "$TM_TOKEN" '{
  "startDate": "2026-09-01T00:00:00",
  "endDate": "2026-09-30T00:00:00",
  "manpowerDetails": []
}')
assert_contains "rejected 状态不能提交变更" "$RULE3" '"code":400'

# 7.4 revision_pending 状态不能重复提交变更
echo "--- 7.4 测试状态校验：revision_pending 不能重复提交 ---"
# 审批 demand2 进入 pending，再提交变更
api PUT "/demands/$DEMAND_ID2/resubmit" "$TM_TOKEN" > /dev/null
api PUT "/demands/$DEMAND_ID2/approve" "$PM_TOKEN" > /dev/null
api PUT "/demands/$DEMAND_ID2/revision" "$TM_TOKEN" '{
  "startDate": "2026-09-01T00:00:00",
  "endDate": "2026-09-30T00:00:00",
  "manpowerDetails": [{"testType": "功能测试", "manpowerDemand": 5, "remark": ""}]
}' > /dev/null

RULE4=$(api PUT "/demands/$DEMAND_ID2/revision" "$TM_TOKEN" '{
  "startDate": "2026-09-01T00:00:00",
  "endDate": "2026-09-30T00:00:00",
  "manpowerDetails": [{"testType": "功能测试", "manpowerDemand": 5, "remark": ""}]
}')
assert_contains "revision_pending 不能重复提交变更" "$RULE4" '"code":400'

# 清理: 批准变更
api PUT "/demands/$DEMAND_ID2/approve-revision" "$PM_TOKEN" > /dev/null

echo ""
echo -e "${YELLOW}=== Step 8: 测试资源主管审批变更 ===${NC}"

# 提交变更
REVISION_RM=$(api PUT "/demands/$DEMAND_ID2/revision" "$TM_TOKEN" '{
  "startDate": "2026-09-05T00:00:00",
  "endDate": "2026-09-25T00:00:00",
  "manpowerDetails": [
    {"testType": "功能测试", "manpowerDemand": 4, "remark": ""}
  ]
}')
assert_contains "提交变更成功" "$REVISION_RM" '"revision_pending"'

# resourceManager 审批
RM_APPROVE=$(api PUT "/demands/$DEMAND_ID2/approve-revision" "$RM_TOKEN")
assert_contains "resourceManager 审批变更成功" "$RM_APPROVE" '"code":200'

echo ""
echo -e "${YELLOW}=== 测试结果汇总 ===${NC}"
echo ""
echo -e "总计: $TOTAL 项测试"
echo -e "${GREEN}通过: $PASS 项${NC}"
echo -e "${RED}失败: $FAIL 项${NC}"
echo ""

if [ $FAIL -eq 0 ]; then
  echo -e "${GREEN}🎉 所有测试通过！${NC}"
else
  echo -e "${RED}⚠️  有 $FAIL 项测试失败，请检查${NC}"
fi
